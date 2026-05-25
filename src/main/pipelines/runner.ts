import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import log from 'electron-log/main.js';

import { toAppError } from '../errors.js';
import type { ModelClient } from '../model-client/index.js';
import type { TaskRepository } from '../db/index.js';
import type { TaskProgressEvent, TaskRecord } from '../../shared/types.js';
import type { WorkflowPromptOverrides } from '../../shared/workflows.js';
import type { PipelineDefinition, StepContext } from './types.js';

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
  await mkdir(artifactDir, { recursive: true });
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

    try {
      const ctx: StepContext = {
        task,
        input: task.input,
        artifactDir,
        repository,
        modelClient,
        workflowPrompts,
        emitProgress,
      };
      const result = await step.runStep(ctx);
      if (isCanceled(repository, task.id)) {
        emitCanceled(repository, task.id, emitProgress);
        return;
      }
      repository.updateStepSuccess(task.id, step.name, result.artifactPath, result.logs);
      const nextProgress = Math.floor(((index + 1) / total) * 100);
      repository.updateTaskProgress(task.id, nextProgress);
      emitProgress({ taskId: task.id, status: 'running', progress: nextProgress, step: step.name });
    } catch (error) {
      const appError = toAppError(error, 'E_MODEL_API_FAILED');
      log.error(`Pipeline step failed: task=${task.id}, step=${step.name}`, appError);
      repository.updateStepFailed(task.id, step.name, appError.message);
      repository.updateTaskStatus(task.id, 'paused', progress, appError.message);
      emitProgress({
        taskId: task.id,
        status: 'paused',
        progress,
        step: step.name,
        message: appError.message,
      });
      throw appError;
    }
  }

  repository.updateTaskStatus(task.id, 'success', 100);
  emitProgress({ taskId: task.id, status: 'success', progress: 100 });
}
