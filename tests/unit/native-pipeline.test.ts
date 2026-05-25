import { mkdtempSync, writeFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { CreateTaskWithSteps, TaskRepository } from '../../src/main/db/index.js';
import type {
  AudioResult,
  ImageResult,
  ModelClient,
  SeedanceVideoRequest,
  TranscriptResult,
  VideoResult,
} from '../../src/main/model-client/index.js';
import type { AssetRecord, TaskRecord, TaskStatus } from '../../src/shared/types.js';
import { nativePipeline } from '../../src/main/pipelines/native/index.js';
import { runPipeline } from '../../src/main/pipelines/runner.js';

class MemoryTaskRepository implements TaskRepository {
  private task: TaskRecord | undefined;
  private readonly assets: AssetRecord[] = [];
  private readonly settings = new Map<string, string>();

  createTask(params: CreateTaskWithSteps): TaskRecord {
    const now = Date.now();
    const task: TaskRecord = {
      id: 'task-native',
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

  cancelTask(taskId: string): TaskRecord | undefined {
    if (!this.task || this.task.id !== taskId) {
      return undefined;
    }
    this.task = { ...this.task, status: 'canceled', error: '任务已取消', updatedAt: Date.now() };
    return this.task;
  }

  deleteTask(taskId: string): boolean {
    if (!this.task || this.task.id !== taskId) {
      return false;
    }
    this.task = undefined;
    return true;
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

  updateStepSuccess(taskId: string, step: string, artifactPath?: string, logs?: string): void {
    this.updateStep(taskId, step, {
      status: 'success',
      ...(artifactPath !== undefined ? { artifactPath } : {}),
      ...(logs !== undefined ? { logs } : {}),
      finishedAt: Date.now(),
    });
  }

  updateStepFailed(taskId: string, step: string, error: string): void {
    this.updateStep(taskId, step, { status: 'failed', logs: error, finishedAt: Date.now() });
  }

  resetStepAndFollowing(): void {
    return undefined;
  }

  listAssets(): AssetRecord[] {
    return this.assets;
  }

  createAsset(asset: Omit<AssetRecord, 'id' | 'createdAt'>): AssetRecord {
    const created: AssetRecord = { ...asset, id: `asset-${this.assets.length}`, createdAt: Date.now() };
    this.assets.unshift(created);
    return created;
  }

  getSetting(key: string): string | undefined {
    return this.settings.get(key);
  }

  setSetting(key: string, value: string): void {
    this.settings.set(key, value);
  }

  pauseRunningTasks(): number {
    if (!this.task || this.task.status !== 'running') {
      return 0;
    }
    this.task = { ...this.task, status: 'paused', updatedAt: Date.now() };
    return 1;
  }

  private updateStep(
    taskId: string,
    stepName: string,
    patch: Partial<TaskRecord['steps'][number]>,
  ): void {
    if (!this.task || this.task.id !== taskId) {
      return;
    }
    this.task = {
      ...this.task,
      steps: this.task.steps.map((step) =>
        step.step === stepName ? { ...step, ...patch } : step,
      ),
    };
  }
}

class NativeMockModelClient implements ModelClient {
  private chatIndex = 0;

  async generateImage(): Promise<ImageResult> {
    throw new Error('generateImage should not be called');
  }

  async generateVideo(req: SeedanceVideoRequest): Promise<VideoResult> {
    await mkdir(dirname(req.outputPath), { recursive: true });
    await writeFile(req.outputPath, 'video', 'utf8');
    return { localPath: req.outputPath, duration: req.durationSec ?? 15 };
  }

  async generateDigitalHuman(): Promise<VideoResult> {
    throw new Error('generateDigitalHuman should not be called');
  }

  async asr(): Promise<TranscriptResult> {
    throw new Error('asr should not be called');
  }

  async tts(): Promise<AudioResult> {
    const localPath = join(mkdtempSync(join(tmpdir(), 'native-tts-')), 'voice.m4a');
    writeFileSync(localPath, 'audio');
    return { localPath, duration: 4 };
  }

  async chat(): Promise<string> {
    const responses = [
      JSON.stringify({
        concepts: [
          {
            index: 1,
            title: '新年健康提醒',
            hook: '新年第一天别忘了身体状态',
            audience: '健康管理用户',
            sellingPoints: ['每日提醒', '轻量记录'],
            modules: ['数字人口播', 'UI 占位', '创意空镜'],
            cta: '立即开启',
            tone: '可信、轻快',
          },
        ],
      }),
      JSON.stringify({
        scripts: [
          {
            index: 1,
            title: '新年健康提醒',
            script: '新的一年，用 AI 健康 APP 记录每天的身体状态。',
            voiceover: '新的一年，用 AI 健康 APP 记录每天的身体状态。',
            cta: '立即开启',
            beats: [{ timeSec: 0, text: '新年健康提醒' }],
          },
        ],
      }),
      JSON.stringify({
        variants: [
          {
            index: 1,
            title: '新年健康提醒',
            script: '新的一年，用 AI 健康 APP 记录每天的身体状态。',
            voiceover: '新的一年，用 AI 健康 APP 记录每天的身体状态。',
            shots: [
              {
                index: 1,
                durationSec: 4,
                imagePrompt: '晨光中的手机健康记录界面',
                videoPrompt: '手机界面轻轻滑动，展示健康提醒与记录',
                voiceoverText: '新的一年，用 AI 健康 APP 记录每天的身体状态。',
                module: 'UI 占位',
              },
            ],
          },
        ],
      }),
    ];
    const response = responses[this.chatIndex];
    this.chatIndex += 1;
    if (response === undefined) {
      throw new Error('unexpected chat call');
    }
    return response;
  }

  async vision(): Promise<string> {
    throw new Error('vision should not be called');
  }

  async visionVideo(): Promise<string> {
    return JSON.stringify({ pass: true, issues: [], score: 0.92 });
  }
}

describe('nativePipeline', () => {
  it('runs the five-industry native workflow and registers final assets', async () => {
    const userDataPath = mkdtempSync(join(tmpdir(), 'native-pipeline-'));
    const repository = new MemoryTaskRepository();
    const task = repository.createTask({
      request: {
        type: 'native',
        input: {
          industry: 'tool',
          brief: '面向 AI 健康 APP 的新年营销短视频，突出每日健康提醒和轻量记录。',
          productName: 'AI 健康 APP',
          variantCount: 1,
          durationSec: 15,
          ratio: '9:16',
        },
      },
      stepNames: nativePipeline.steps.map((step) => step.name),
    });

    await runPipeline({
      task,
      pipeline: nativePipeline,
      repository,
      modelClient: new NativeMockModelClient(),
      workflowPrompts: {},
      userDataPath,
      emitProgress: () => undefined,
    });

    const completed = repository.getTask(task.id);
    expect(completed?.status).toBe('success');
    expect(completed?.steps.every((step) => step.status === 'success')).toBe(true);
    expect(repository.listAssets()).toEqual([
      expect.objectContaining({
        taskId: task.id,
        kind: 'video',
        tags: ['native', 'tool'],
      }),
    ]);
  });
});
