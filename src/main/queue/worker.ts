import PQueue from 'p-queue';

import { getPipeline, getStepNames } from '../pipelines/index.js';
import { runPipeline, type ProgressEmitter } from '../pipelines/runner.js';
import type { ModelClientFactory } from '../model-client/index.js';
import type { TaskRepository } from '../db/index.js';
import { validateCreateTaskRequest } from '../validation.js';
import type { CreateTaskRequest, RetryStepRequest, TaskRecord } from '../../shared/types.js';

export class TaskWorker {
  private readonly queue: PQueue;

  constructor(
    private readonly repository: TaskRepository,
    private readonly modelClientFactory: ModelClientFactory,
    private readonly userDataPath: string,
    private readonly emitProgress: ProgressEmitter,
    concurrency = 1,
  ) {
    this.queue = new PQueue({ concurrency });
  }

  createTask(request: CreateTaskRequest): TaskRecord {
    const validated = validateCreateTaskRequest(request);
    const task = this.repository.createTask({
      request: validated,
      stepNames: getStepNames(validated.type),
    });
    this.enqueue(task.id);
    return task;
  }

  retryTask(taskId: string): void {
    const task = this.repository.getTask(taskId);
    if (!task) {
      return;
    }
    this.repository.updateTaskStatus(task.id, 'queued', task.progress);
    this.enqueue(task.id);
  }

  retryStep(request: RetryStepRequest): void {
    this.repository.resetStepAndFollowing(request.taskId, request.stepId);
    this.enqueue(request.taskId);
  }

  private enqueue(taskId: string): void {
    this.queue.add(async () => {
      const task = this.repository.getTask(taskId);
      if (!task) {
        return;
      }
      const pipeline = getPipeline(task.type);
      const modelClient = await this.modelClientFactory.create();
      await runPipeline({
        task,
        pipeline,
        repository: this.repository,
        modelClient,
        userDataPath: this.userDataPath,
        emitProgress: this.emitProgress,
      });
    });
  }
}
