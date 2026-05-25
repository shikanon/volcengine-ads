import PQueue from 'p-queue';

import { AppError } from '../errors.js';
import { getPipeline, getStepNames } from '../pipelines/index.js';
import { runPipeline, type ProgressEmitter } from '../pipelines/runner.js';
import type { ModelClientFactory } from '../model-client/index.js';
import type { TaskRepository } from '../db/index.js';
import { validateCreateTaskRequest } from '../validation.js';
import type { CreateTaskRequest, RetryStepRequest, TaskRecord } from '../../shared/types.js';
import type { WorkflowPromptOverrides } from '../../shared/workflows.js';

export class TaskWorker {
  private readonly queue: PQueue;
  private readonly activeTaskIds = new Set<string>();

  constructor(
    private readonly repository: TaskRepository,
    private readonly modelClientFactory: ModelClientFactory,
    private readonly userDataPath: string,
    private readonly loadWorkflowPrompts: () => WorkflowPromptOverrides,
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

  cancelTask(taskId: string): TaskRecord | undefined {
    const task = this.repository.cancelTask(taskId);
    if (task) {
      this.emitProgress({
        taskId: task.id,
        status: 'canceled',
        progress: task.progress,
        message: '任务已取消',
      });
    }
    return task;
  }

  deleteTask(taskId: string): boolean {
    if (this.activeTaskIds.has(taskId)) {
      throw new AppError('E_TASK_STATE', '任务正在停止，请稍后再删除');
    }
    const task = this.repository.getTask(taskId);
    if (!task) {
      throw new AppError('E_TASK_NOT_FOUND');
    }
    if (task.status === 'running') {
      throw new AppError('E_TASK_STATE', '运行中的任务请先取消');
    }
    return this.repository.deleteTask(taskId);
  }

  cloneTask(taskId: string): TaskRecord {
    const source = this.repository.getTask(taskId);
    if (!source) {
      throw new AppError('E_TASK_NOT_FOUND');
    }
    const task = this.repository.cloneTask(taskId, getStepNames(source.type));
    if (!task) {
      throw new AppError('E_TASK_NOT_FOUND');
    }
    this.enqueue(task.id);
    return task;
  }

  private enqueue(taskId: string): void {
    this.queue.add(async () => {
      const task = this.repository.getTask(taskId);
      if (!task || task.status !== 'queued') {
        return;
      }
      this.activeTaskIds.add(taskId);
      try {
        const pipeline = getPipeline(task.type);
        const modelClient = await this.modelClientFactory.create();
        const workflowPrompts = this.loadWorkflowPrompts();
        await runPipeline({
          task,
          pipeline,
          repository: this.repository,
          modelClient,
          workflowPrompts,
          userDataPath: this.userDataPath,
          emitProgress: this.emitProgress,
        });
      } finally {
        this.activeTaskIds.delete(taskId);
      }
    });
  }
}
