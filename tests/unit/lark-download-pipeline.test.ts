import { mkdtempSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import type { CreateTaskWithSteps, TaskRepository } from '../../src/main/db/index.js';
import type { ModelClient } from '../../src/main/model-client/index.js';
import { larkDownloadPipeline } from '../../src/main/pipelines/lark-download/index.js';
import { runPipeline } from '../../src/main/pipelines/runner.js';
import type { AssetRecord, TaskRecord, TaskStatus } from '../../src/shared/types.js';

vi.mock('../../src/main/services/lark-download.js', async () => ({
  downloadLarkVideos: vi.fn(async ({ artifactDir, input }) => {
    const outputDir = join(artifactDir, 'downloads', 'doc-token');
    const summaryPath = join(outputDir, 'download-summary.json');
    await mkdir(dirname(summaryPath), { recursive: true });
    await writeFile(
      summaryPath,
      JSON.stringify(
        {
          sourceUrl: input.url,
          sourceType: 'docx',
          sourceToken: 'doc-token',
          outputDir,
          discovered: 1,
          successCount: 1,
          failureCount: 0,
          loginRequired: false,
          successes: [
            {
              fileToken: 'file-a',
              mountNodeToken: 'block-a',
              name: 'video-a.mp4',
              path: join(outputDir, 'video-a.mp4'),
              size: 6,
              quality: '720p',
              skipped: false,
            },
          ],
          failures: [],
        },
        null,
        2,
      ),
      'utf8',
    );
    return {
      summary: {
        sourceUrl: input.url,
        sourceType: 'docx' as const,
        sourceToken: 'doc-token',
        outputDir,
        discovered: 1,
        successCount: 1,
        failureCount: 0,
        loginRequired: false,
        successes: [
          {
            fileToken: 'file-a',
            mountNodeToken: 'block-a',
            name: 'video-a.mp4',
            path: join(outputDir, 'video-a.mp4'),
            size: 6,
            quality: '720p',
            skipped: false,
          },
        ],
        failures: [],
      },
      summaryPath,
    };
  }),
}));

class MemoryTaskRepository implements TaskRepository {
  private task: TaskRecord | undefined;
  private readonly assets: AssetRecord[] = [];

  createTask(params: CreateTaskWithSteps): TaskRecord {
    const now = Date.now();
    const task: TaskRecord = {
      id: 'task-lark-download',
      type: params.request.type,
      status: 'queued',
      progress: 0,
      input: params.request.input,
      createdAt: now,
      updatedAt: now,
      steps: params.stepNames.map((step, index) => ({
        id: `step-${index}`,
        step,
        status: 'pending',
      })),
    };
    this.task = task;
    return task;
  }

  cloneTask(): TaskRecord | undefined {
    return undefined;
  }

  listTasks(): TaskRecord[] {
    return this.task ? [this.task] : [];
  }

  getTask(taskId: string): TaskRecord | undefined {
    return this.task?.id === taskId ? this.task : undefined;
  }

  cancelTask(): TaskRecord | undefined {
    return undefined;
  }

  deleteTask(): boolean {
    return false;
  }

  updateTaskStatus(taskId: string, status: TaskStatus, progress: number, error?: string): void {
    if (!this.task || this.task.id !== taskId) {
      return;
    }
    this.task = {
      ...this.task,
      status,
      progress,
      updatedAt: Date.now(),
      ...(error !== undefined ? { error } : {}),
    };
  }

  updateTaskProgress(taskId: string, progress: number): void {
    if (!this.task || this.task.id !== taskId) {
      return;
    }
    this.task = { ...this.task, progress, updatedAt: Date.now() };
  }

  updateStepRunning(taskId: string, step: string): void {
    this.updateStep(taskId, step, { status: 'running', startedAt: Date.now() });
  }

  updateStepWaitingConfirmation(): void {
    throw new Error('script confirmation is not used in lark download tests');
  }

  updateStepSuccess(taskId: string, step: string, artifactPath?: string, logs?: string): void {
    this.updateStep(taskId, step, {
      status: 'success',
      ...(artifactPath !== undefined ? { artifactPath } : {}),
      ...(logs !== undefined ? { logs } : {}),
      finishedAt: Date.now(),
    });
  }

  updateStepFailed(taskId: string, step: string, error: string): void {
    this.updateStep(taskId, step, {
      status: 'failed',
      logs: error,
      finishedAt: Date.now(),
    });
  }

  confirmWaitingStep(): TaskRecord | undefined {
    return undefined;
  }

  resetStepAndFollowing(): void {
    throw new Error('step retry is not used in lark download tests');
  }

  listAssets(): AssetRecord[] {
    return this.assets;
  }

  createAsset(asset: Omit<AssetRecord, 'id' | 'createdAt'>): AssetRecord {
    const created: AssetRecord = {
      ...asset,
      id: `asset-${this.assets.length + 1}`,
      createdAt: Date.now(),
    };
    this.assets.push(created);
    return created;
  }

  getSetting(): string | undefined {
    return undefined;
  }

  setSetting(): void {
    return undefined;
  }

  pauseRunningTasks(): number {
    return 0;
  }

  private updateStep(taskId: string, step: string, patch: Partial<TaskRecord['steps'][number]>): void {
    if (!this.task || this.task.id !== taskId) {
      return;
    }
    this.task = {
      ...this.task,
      updatedAt: Date.now(),
      steps: this.task.steps.map((current) => (current.step === step ? { ...current, ...patch } : current)),
    };
  }
}

describe('larkDownloadPipeline', () => {
  it('runs the download step and registers the summary report asset', async () => {
    const userDataPath = mkdtempSync(join(tmpdir(), 'lark-download-pipeline-'));
    const repository = new MemoryTaskRepository();
    const task = repository.createTask({
      request: {
        type: 'lark_download',
        input: {
          url: 'https://bytedance.larkoffice.com/docx/doc-token',
        },
      },
      stepNames: larkDownloadPipeline.steps.map((step) => step.name),
    });

    await runPipeline({
      task,
      pipeline: larkDownloadPipeline,
      repository,
      modelClient: {} as ModelClient,
      workflowPrompts: {},
      userDataPath,
      emitProgress: () => undefined,
    });

    const completed = repository.getTask(task.id);
    const summaryPath = join(userDataPath, 'artifacts', task.id, 'downloads', 'doc-token', 'download-summary.json');
    expect(completed?.status).toBe('success');
    expect(completed?.steps).toEqual([
      expect.objectContaining({
        step: 'download',
        status: 'success',
        artifactPath: summaryPath,
        logs: '发现 1 个视频块，成功 1 个，失败 0 个。',
      }),
    ]);
    expect(repository.listAssets()).toEqual([
      expect.objectContaining({
        taskId: task.id,
        kind: 'report',
        path: summaryPath,
        tags: ['lark_download', 'docx'],
      }),
    ]);
    await expect(readFile(summaryPath, 'utf8')).resolves.toContain('"successCount": 1');
  });
});
