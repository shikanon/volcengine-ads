import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import log from 'electron-log/main.js';

import { toAppError } from '../errors.js';
import type { ModelClient } from '../model-client/index.js';
import type { TaskRepository } from '../db/index.js';
import type { TaskProgressEvent, TaskRecord } from '../../shared/types.js';
import type { WorkflowPromptOverrides } from '../../shared/workflows.js';
import { runCodexDiagnosisOnce } from './codex-diagnosis.js';
import type { PipelineDefinition, StepContext } from './types.js';
import {
  appendPipelineLog,
  errorToLogFields,
  formatErrorForUser,
  type PipelineLogLevel,
} from './task-log.js';

export type ProgressEmitter = (event: TaskProgressEvent) => void;

function isCanceled(repository: TaskRepository, taskId: string): boolean {
  return repository.getTask(taskId)?.status === 'canceled';
}

function emitCanceled(repository: TaskRepository, taskId: string, emitProgress: ProgressEmitter): void {
  const task = repository.getTask(taskId);
  if (!task) {
    return;
  }
  emitProgress({
    taskId,
    status: 'canceled',
    progress: task.progress,
    message: task.error ?? '任务已取消',
  });
}

export async function runPipeline(params: {
  task: TaskRecord;
  pipeline: PipelineDefinition;
  repository: TaskRepository;
  modelClient: ModelClient;
  workflowPrompts: WorkflowPromptOverrides;
  userDataPath: string;
  emitProgress: ProgressEmitter;
}): Promise<void> {
  const { task, pipeline, repository, modelClient, workflowPrompts, userDataPath, emitProgress } =
    params;
  const artifactDir = join(userDataPath, 'artifacts', task.id);
  const logFilePath = join(artifactDir, 'pipeline.log');
  await mkdir(artifactDir, { recursive: true });
  await appendPipelineLog(logFilePath, {
    taskId: task.id,
    step: 'pipeline',
    level: 'info',
    message: '任务开始执行',
    data: { taskType: task.type, artifactDir },
  });
  repository.updateTaskStatus(task.id, 'running', task.progress);

  const total = pipeline.steps.length;
  for (const [index, step] of pipeline.steps.entries()) {
    if (isCanceled(repository, task.id)) {
      emitCanceled(repository, task.id, emitProgress);
      return;
    }
    const existing = repository.getTask(task.id)?.steps.find((item) => item.step === step.name);
    if (existing?.status === 'success' && existing.artifactPath && existsSync(existing.artifactPath)) {
      continue;
    }
    const progress = Math.floor((index / total) * 100);
    repository.updateStepRunning(task.id, step.name);
    repository.updateTaskProgress(task.id, progress);
    emitProgress({ taskId: task.id, status: 'running', progress, step: step.name });
    await appendPipelineLog(logFilePath, {
      taskId: task.id,
      step: step.name,
      level: 'info',
      message: '节点开始执行',
      data: { progress },
    });

    try {
      const appendLog = async (
        level: PipelineLogLevel,
        message: string,
        data?: Record<string, unknown>,
      ): Promise<void> => {
        await appendPipelineLog(logFilePath, {
          taskId: task.id,
          step: step.name,
          level,
          message,
          ...(data !== undefined ? { data } : {}),
        });
      };
      const ctx: StepContext = {
        task,
        input: task.input,
        artifactDir,
        logFilePath,
        repository,
        modelClient,
        workflowPrompts,
        emitProgress,
        appendLog,
      };
      const result = await step.runStep(ctx);
      if (isCanceled(repository, task.id)) {
        emitCanceled(repository, task.id, emitProgress);
        return;
      }
      if (result.awaitingConfirmation) {
        repository.updateStepWaitingConfirmation(task.id, step.name, result.artifactPath, result.logs);
        repository.updateTaskStatus(
          task.id,
          'waiting_confirmation',
          progress,
          result.awaitingConfirmation.message,
        );
        await appendPipelineLog(logFilePath, {
          taskId: task.id,
          step: step.name,
          level: 'info',
          message: '节点等待人工确认',
          data: {
            progress,
            ...(result.artifactPath !== undefined ? { artifactPath: result.artifactPath } : {}),
          },
        });
        emitProgress({
          taskId: task.id,
          status: 'waiting_confirmation',
          progress,
          step: step.name,
          message: result.awaitingConfirmation.message,
        });
        return;
      }
      repository.updateStepSuccess(task.id, step.name, result.artifactPath, result.logs);
      const nextProgress = Math.floor(((index + 1) / total) * 100);
      repository.updateTaskProgress(task.id, nextProgress);
      await appendPipelineLog(logFilePath, {
        taskId: task.id,
        step: step.name,
        level: 'info',
        message: '节点执行成功',
        data: {
          progress: nextProgress,
          ...(result.artifactPath !== undefined ? { artifactPath: result.artifactPath } : {}),
          ...(result.logs !== undefined ? { logs: result.logs } : {}),
        },
      });
      emitProgress({ taskId: task.id, status: 'running', progress: nextProgress, step: step.name });
    } catch (error) {
      const appError = toAppError(error, 'E_MODEL_API_FAILED');
      log.error(`Pipeline step failed: task=${task.id}, step=${step.name}`, appError);
      await appendPipelineLog(logFilePath, {
        taskId: task.id,
        step: step.name,
        level: 'error',
        message: '节点执行失败',
        ...errorToLogFields(appError),
        data: { progress },
      });
      const diagnosisPath = await runCodexDiagnosisOnce({
        task,
        stepName: step.name,
        artifactDir,
        logFilePath,
        error: appError,
      });
      if (diagnosisPath !== undefined) {
        await appendPipelineLog(logFilePath, {
          taskId: task.id,
          step: step.name,
          level: 'info',
          message: 'Codex CLI 自动诊断完成',
          data: { diagnosisPath },
        });
      }
      const userError = [
        formatErrorForUser(appError, logFilePath),
        diagnosisPath !== undefined ? `Codex诊断文件：${diagnosisPath}` : undefined,
      ]
        .filter((line): line is string => line !== undefined)
        .join('\n');
      repository.updateStepFailed(task.id, step.name, userError);
      repository.updateTaskStatus(task.id, 'paused', progress, userError);
      emitProgress({
        taskId: task.id,
        status: 'paused',
        progress,
        step: step.name,
        message: userError,
      });
      throw appError;
    }
  }

  repository.updateTaskStatus(task.id, 'success', 100);
  await appendPipelineLog(logFilePath, {
    taskId: task.id,
    step: 'pipeline',
    level: 'info',
    message: '任务执行成功',
    data: { progress: 100 },
  });
  emitProgress({ taskId: task.id, status: 'success', progress: 100 });
}
