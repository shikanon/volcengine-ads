import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import log from 'electron-log/main.js';

import { toAppError } from '../errors.js';
import type { ModelClient } from '../model-client/index.js';
import type { TaskRepository } from '../db/index.js';
import type { TaskProgressEvent, TaskRecord } from '../../shared/types.js';
import type { PipelineDefinition, StepContext } from './types.js';

export type ProgressEmitter = (event: TaskProgressEvent) => void;

export async function runPipeline(params: {
  task: TaskRecord;
  pipeline: PipelineDefinition;
  repository: TaskRepository;
  modelClient: ModelClient;
  userDataPath: string;
  emitProgress: ProgressEmitter;
}): Promise<void> {
  const { task, pipeline, repository, modelClient, userDataPath, emitProgress } = params;
  const artifactDir = join(userDataPath, 'artifacts', task.id);
  await mkdir(artifactDir, { recursive: true });
  repository.updateTaskStatus(task.id, 'running', task.progress);

  const total = pipeline.steps.length;
  for (const [index, step] of pipeline.steps.entries()) {
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
        emitProgress,
      };
      const result = await step.runStep(ctx);
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
