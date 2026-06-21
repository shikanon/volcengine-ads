import { mkdtempSync, writeFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

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
import { concatSilentVideos, concatVideos, muxAudioVideo } from '../../src/main/media/ffmpeg.js';
import { nativePipeline } from '../../src/main/pipelines/native/index.js';
import { runPipeline } from '../../src/main/pipelines/runner.js';
import { VIDEO_TEXT_STICKER_PROMPT } from '../../src/shared/workflows.js';

vi.mock('../../src/main/media/ffmpeg.js', async () => {
  const { mkdir, writeFile } = await import('node:fs/promises');
  const { dirname } = await import('node:path');
  return {
    trimVideo: vi.fn(async (_inputPath: string, outputPath: string) => {
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, 'reference', 'utf8');
      return outputPath;
    }),
    concatSilentVideos: vi.fn(async (videoPaths: string[], outputPath: string) => {
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, `concat:${videoPaths.join(',')}`, 'utf8');
      return outputPath;
    }),
    concatVideos: vi.fn(async (videoPaths: string[], outputPath: string) => {
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, `concat-av:${videoPaths.join(',')}`, 'utf8');
      return outputPath;
    }),
    muxAudioVideo: vi.fn(async (_videoPath: string, _audioPath: string, outputPath: string) => {
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, 'muxed-audio', 'utf8');
      return outputPath;
    }),
  };
});

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

  updateStepWaitingConfirmation(taskId: string, step: string, artifactPath?: string, logs?: string): void {
    this.updateStep(taskId, step, {
      status: 'waiting_confirmation',
      ...(artifactPath !== undefined ? { artifactPath } : {}),
      ...(logs !== undefined ? { logs } : {}),
    });
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

  confirmWaitingStep(taskId: string): TaskRecord | undefined {
    const task = this.getTask(taskId);
    if (!task || task.status !== 'waiting_confirmation') {
      return undefined;
    }
    const waiting = task.steps.find((step) => step.status === 'waiting_confirmation');
    if (!waiting) {
      return undefined;
    }
    this.updateStep(taskId, waiting.step, {
      status: 'success',
      logs: '脚本文案已确认',
      finishedAt: Date.now(),
    });
    if (this.task) {
      const next: TaskRecord = { ...this.task, status: 'queued', updatedAt: Date.now() };
      delete next.error;
      this.task = next;
    }
    return this.getTask(taskId);
  }

  resetStepAndFollowing(): void {
    return undefined;
  }

  listAssets(): AssetRecord[] {
    return this.assets;
  }

  createAsset(asset: Omit<AssetRecord, 'id' | 'createdAt'>): AssetRecord {
    const created: AssetRecord = {
      ...asset,
      id: `asset-${this.assets.length}`,
      createdAt: Date.now(),
    };
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
      steps: this.task.steps.map((step) => (step.step === stepName ? { ...step, ...patch } : step)),
    };
  }
}

class NativeMockModelClient implements ModelClient {
  private chatIndex = 0;
  readonly videoRequests: SeedanceVideoRequest[] = [];
  private readonly failedVideoIndexes = new Set<number | string>();

  constructor(
    private readonly failVideoOnceForIndexes: number[] = [],
    private readonly visionVideoResponse = JSON.stringify({ pass: true, issues: [], score: 0.92 }),
    private readonly failVideoOnceForOutputPathIncludes: string[] = [],
    private readonly onVideoRequest?: (req: SeedanceVideoRequest) => Promise<void> | void,
  ) {}

  async generateImage(): Promise<ImageResult> {
    throw new Error('generateImage should not be called');
  }

  async generateVideo(req: SeedanceVideoRequest): Promise<VideoResult> {
    this.videoRequests.push(req);
    await this.onVideoRequest?.(req);
    const match = /asset_variant_(\d+)\.mp4/u.exec(req.outputPath);
    const index = match ? Number(match[1]) : undefined;
    if (
      index !== undefined &&
      this.failVideoOnceForIndexes.includes(index) &&
      !this.failedVideoIndexes.has(index)
    ) {
      this.failedVideoIndexes.add(index);
      throw new Error(`Seedance task failed for variant ${index}: InvalidParameter detail`);
    }
    const outputPathFailureKey = this.failVideoOnceForOutputPathIncludes.find((item) =>
      req.outputPath.includes(item),
    );
    if (
      outputPathFailureKey !== undefined &&
      !this.failedVideoIndexes.has(req.outputPath)
    ) {
      this.failedVideoIndexes.add(req.outputPath);
      throw new Error(`Seedance task failed for ${outputPathFailureKey}: InvalidParameter detail`);
    }
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

  async webSearch(): Promise<never> {
    throw new Error('webSearch should not be called');
  }

  async vision(): Promise<string> {
    throw new Error('vision should not be called');
  }

  async visionVideo(): Promise<string> {
    return this.visionVideoResponse;
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

    const runParams = {
      task,
      pipeline: nativePipeline,
      repository,
      modelClient: new NativeMockModelClient(),
      workflowPrompts: {},
      userDataPath,
      emitProgress: () => undefined,
    };

    await runPipeline(runParams);

    const waiting = repository.getTask(task.id);
    expect(waiting?.status).toBe('waiting_confirmation');
    expect(waiting?.steps.find((step) => step.step === 'script_confirm')).toMatchObject({
      status: 'waiting_confirmation',
    });

    repository.confirmWaitingStep(task.id);
    await runPipeline(runParams);

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

  it('keeps native task successful when consistency checker only returns warnings', async () => {
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

    const runParams = {
      task,
      pipeline: nativePipeline,
      repository,
      modelClient: new NativeMockModelClient(
        [],
        JSON.stringify({
          pass: false,
          issues: ['首秒钩子偏弱', '商品识别度一般'],
          score: 0.42,
          repairPrompt: '把商品特写和痛点动作提前到 0-1 秒。',
          regeneratePolicy: '保留后半段，优先重做开场镜头。',
        }),
      ),
      workflowPrompts: {},
      userDataPath,
      emitProgress: () => undefined,
    };

    await runPipeline(runParams);
    repository.confirmWaitingStep(task.id);
    await runPipeline(runParams);

    const completed = repository.getTask(task.id);
    expect(completed?.status).toBe('success');
    expect(completed?.steps.find((step) => step.step === 'consistency_checker')).toMatchObject({
      status: 'success',
    });
    expect(repository.listAssets()).toEqual([
      expect.objectContaining({
        taskId: task.id,
        kind: 'video',
        tags: ['native', 'tool'],
      }),
    ]);

    const consistency = JSON.parse(
      await readFile(join(userDataPath, 'artifacts', task.id, 'consistency.json'), 'utf8'),
    ) as {
      checks: Array<{ pass: boolean; score: number; issues: string[]; repairPrompt?: string }>;
      summary: { total: number; passed: number; warned: number; blocking: boolean };
    };
    expect(consistency.summary).toEqual({
      total: 1,
      passed: 0,
      warned: 1,
      blocking: false,
    });
    expect(consistency.checks[0]).toMatchObject({
      pass: false,
      score: 0.42,
      issues: ['首秒钩子偏弱', '商品识别度一般'],
      repairPrompt: '把商品特写和痛点动作提前到 0-1 秒。',
    });
  });

  it('persists native asset generation successes and skips them on retry', async () => {
    const artifactDir = mkdtempSync(join(tmpdir(), 'native-assets-'));
    const input = {
      industry: 'tool' as const,
      brief: '生成工具类广告素材',
      productName: 'AI 工具',
      variantCount: 2,
      durationSec: 15,
      ratio: '9:16' as const,
    };
    const task: TaskRecord = {
      id: 'task-native',
      type: 'native',
      status: 'running',
      progress: 0,
      input,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      steps: [],
    };
    await writeFile(
      join(artifactDir, 'industry.json'),
      JSON.stringify({
        industry: 'tool',
        title: '工具',
        formula: '痛点 + 演示 + CTA',
        durationRange: '15-30s',
        requiredModules: ['UI 演示'],
        complianceFocus: '真实承诺',
        hardRules: { blacklistWords: [], forbiddenScenes: [] },
      }),
      'utf8',
    );
    await writeFile(
      join(artifactDir, 'storyboard.json'),
      JSON.stringify({
        variants: [
          {
            index: 1,
            title: '工具提效 A',
            script: '展示工具提效。',
            shots: [
              {
                index: 1,
                durationSec: 4,
                imagePrompt: '工具界面',
                videoPrompt: '工具界面流畅滚动',
              },
            ],
          },
          {
            index: 2,
            title: '工具提效 B',
            script: '展示工具提效第二版。',
            shots: [
              {
                index: 1,
                durationSec: 4,
                imagePrompt: '工具界面',
                videoPrompt: '工具界面自动完成任务',
              },
            ],
          },
        ],
      }),
      'utf8',
    );

    const step = nativePipeline.steps.find((item) => item.name === 'asset_generator');
    if (step === undefined) {
      throw new Error('asset_generator step missing');
    }

    const modelClient = new NativeMockModelClient([2]);
    const ctx = {
      task,
      input,
      artifactDir,
      repository: {} as TaskRepository,
      modelClient,
      workflowPrompts: {},
      emitProgress: () => undefined,
    };

    await expect(step.runStep(ctx)).rejects.toThrow(/素材生成部分失败/u);

    const firstReport = JSON.parse(await readFile(join(artifactDir, 'assets.json'), 'utf8')) as {
      assets: Array<{ index: number; status: string; error?: string }>;
      summary: { success: number; failed: number; skipped: number };
    };
    expect(firstReport.summary).toMatchObject({ success: 1, failed: 1, skipped: 0 });
    expect(firstReport.assets).toEqual([
      expect.objectContaining({ index: 1, status: 'success' }),
      expect.objectContaining({
        index: 2,
        status: 'failed',
        error: expect.stringContaining('InvalidParameter detail'),
      }),
    ]);

    await expect(step.runStep(ctx)).resolves.toEqual({
      artifactPath: join(artifactDir, 'assets.json'),
    });

    const secondReport = JSON.parse(await readFile(join(artifactDir, 'assets.json'), 'utf8')) as {
      summary: { success: number; failed: number; skipped: number };
    };
    expect(secondReport.summary).toMatchObject({ success: 2, failed: 0, skipped: 1 });
    expect(modelClient.videoRequests.map((request) => request.outputPath)).toEqual([
      join(artifactDir, 'asset_variant_1.mp4'),
      join(artifactDir, 'asset_variant_2.mp4'),
      join(artifactDir, 'asset_variant_2.mp4'),
    ]);
    expect(modelClient.videoRequests.map((request) => request.generateAudio)).toEqual([
      true,
      true,
      true,
    ]);
    expect(modelClient.videoRequests.map((request) => request.ratio)).toEqual([
      '9:16',
      '9:16',
      '9:16',
    ]);
    expect(modelClient.videoRequests[0]?.prompt).toContain(VIDEO_TEXT_STICKER_PROMPT);
    expect(modelClient.videoRequests[0]?.prompt).toContain('口播参考（仅用于节奏，不生成画面文字）');
    expect(modelClient.videoRequests[0]?.prompt).not.toContain('口播/字幕');
  });

  it('passes native reference video, images and audio into Seedance requests', async () => {
    const artifactDir = mkdtempSync(join(tmpdir(), 'native-assets-'));
    const referenceVideoPath = join(artifactDir, 'reference.mp4');
    const referenceImagePath1 = join(artifactDir, 'reference-1.png');
    const referenceImagePath2 = join(artifactDir, 'reference-2.jpg');
    const referenceAudioPath = join(artifactDir, 'reference.wav');
    writeFileSync(referenceVideoPath, 'video');
    writeFileSync(referenceImagePath1, 'image');
    writeFileSync(referenceImagePath2, 'image');
    writeFileSync(referenceAudioPath, 'audio');
    const input = {
      industry: 'tool' as const,
      brief: '生成带参考素材的工具类广告素材',
      productName: 'AI 工具',
      referenceVideoPath,
      referenceImagePaths: [referenceImagePath1, referenceImagePath2],
      referenceAudioPath,
      variantCount: 1,
      durationSec: 15,
      ratio: '9:16' as const,
    };
    const task: TaskRecord = {
      id: 'task-native',
      type: 'native',
      status: 'running',
      progress: 0,
      input,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      steps: [],
    };
    await writeFile(
      join(artifactDir, 'industry.json'),
      JSON.stringify({
        industry: 'tool',
        title: '工具',
        formula: '痛点 + 演示 + CTA',
        durationRange: '15-30s',
        requiredModules: ['UI 演示'],
        complianceFocus: '真实承诺',
        hardRules: { blacklistWords: [], forbiddenScenes: [] },
      }),
      'utf8',
    );
    await writeFile(
      join(artifactDir, 'storyboard.json'),
      JSON.stringify({
        variants: [
          {
            index: 1,
            title: '工具提效 A',
            script: '展示工具提效。',
            shots: [
              {
                index: 1,
                durationSec: 4,
                imagePrompt: '工具界面',
                videoPrompt: '工具界面自动完成任务',
              },
            ],
          },
        ],
      }),
      'utf8',
    );

    const step = nativePipeline.steps.find((item) => item.name === 'asset_generator');
    if (step === undefined) {
      throw new Error('asset_generator step missing');
    }
    const modelClient = new NativeMockModelClient();

    await expect(
      step.runStep({
        task,
        input,
        artifactDir,
        repository: {} as TaskRepository,
        modelClient,
        workflowPrompts: {},
        emitProgress: () => undefined,
      }),
    ).resolves.toEqual({ artifactPath: join(artifactDir, 'assets.json') });

    expect(modelClient.videoRequests).toHaveLength(1);
    expect(modelClient.videoRequests[0]).toMatchObject({
      refVideoPath: join(artifactDir, 'seedance_reference.mp4'),
      refImagePaths: [referenceImagePath1, referenceImagePath2],
      audioPath: referenceAudioPath,
      ratio: '9:16',
      generateAudio: true,
      outputPath: join(artifactDir, 'asset_variant_1.mp4'),
    });
    expect(modelClient.videoRequests[0]?.prompt).toContain('参考图用于稳定人物、商品、场景或风格锚点');
    expect(modelClient.videoRequests[0]?.prompt).toContain('参考音频用于借节奏、语气、情绪或音效氛围');

    const report = JSON.parse(await readFile(join(artifactDir, 'assets.json'), 'utf8')) as {
      assets: Array<{
        usedReferenceVideo?: boolean;
        usedReferenceImages?: boolean;
        usedReferenceAudio?: boolean;
        referenceImagePaths?: string[];
        referenceAudioPath?: string;
        segments?: Array<{
          usedReferenceImages?: boolean;
          usedReferenceAudio?: boolean;
          referenceImagePaths?: string[];
          referenceAudioPath?: string;
        }>;
      }>;
    };
    expect(report.assets[0]).toMatchObject({
      usedReferenceVideo: true,
      usedReferenceImages: true,
      usedReferenceAudio: true,
      referenceImagePaths: [referenceImagePath1, referenceImagePath2],
      referenceAudioPath,
    });
    expect(report.assets[0]?.segments?.[0]).toMatchObject({
      usedReferenceImages: true,
      usedReferenceAudio: true,
      referenceImagePaths: [referenceImagePath1, referenceImagePath2],
      referenceAudioPath,
    });
  });

  it('splits native videos longer than Seedance limit and records segment outputs', async () => {
    const artifactDir = mkdtempSync(join(tmpdir(), 'native-assets-'));
    const input = {
      industry: 'tool' as const,
      brief: '生成 25 秒工具类广告素材',
      productName: 'AI 工具',
      variantCount: 1,
      durationSec: 25,
      ratio: '9:16' as const,
      resolution: '480p' as const,
    };
    const task: TaskRecord = {
      id: 'task-native',
      type: 'native',
      status: 'running',
      progress: 0,
      input,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      steps: [],
    };
    await writeFile(
      join(artifactDir, 'industry.json'),
      JSON.stringify({
        industry: 'tool',
        title: '工具',
        formula: '痛点 + 演示 + CTA',
        durationRange: '15-30s',
        requiredModules: ['UI 演示'],
        complianceFocus: '真实承诺',
        hardRules: { blacklistWords: [], forbiddenScenes: [] },
      }),
      'utf8',
    );
    await writeFile(
      join(artifactDir, 'storyboard.json'),
      JSON.stringify({
        variants: [
          {
            index: 1,
            title: '轻量机能背包25s原生爆款广告',
            script: '展示痛点、功能演示和购买引导。',
            voiceover: '背包很轻，也很能装。通勤、短途、健身都能一包搞定。',
            shots: [
              {
                index: 1,
                durationSec: 15,
                imagePrompt: '通勤场景中的轻量背包',
                videoPrompt: '镜头展示背包外观、肩带和多个收纳区',
              },
              {
                index: 2,
                durationSec: 10,
                imagePrompt: '桌面上的背包收纳展示',
                videoPrompt: '镜头展示电脑、水杯和运动装备依次装入背包',
              },
            ],
          },
        ],
      }),
      'utf8',
    );

    const step = nativePipeline.steps.find((item) => item.name === 'asset_generator');
    if (step === undefined) {
      throw new Error('asset_generator step missing');
    }
    const modelClient = new NativeMockModelClient();

    await expect(
      step.runStep({
        task,
        input,
        artifactDir,
        repository: {} as TaskRepository,
        modelClient,
        workflowPrompts: {},
        emitProgress: () => undefined,
      }),
    ).resolves.toEqual({ artifactPath: join(artifactDir, 'assets.json') });

    expect(modelClient.videoRequests.map((request) => request.durationSec)).toEqual([15, 10]);
    expect(modelClient.videoRequests.map((request) => request.generateAudio)).toEqual([
      true,
      true,
    ]);
    expect(modelClient.videoRequests.map((request) => request.ratio)).toEqual(['9:16', '9:16']);
    expect(modelClient.videoRequests.map((request) => request.resolution)).toEqual([
      '480p',
      '480p',
    ]);
    expect(modelClient.videoRequests[1]?.prompt).toContain('参考该视频的主体位置');
    expect(modelClient.videoRequests.map((request) => request.outputPath)).toEqual([
      join(artifactDir, 'asset_variant_1_part_1.mp4'),
      join(artifactDir, 'asset_variant_1_part_2.mp4'),
    ]);
    expect(concatSilentVideos).toHaveBeenCalledWith(
      [join(artifactDir, 'asset_variant_1_part_1.mp4'), join(artifactDir, 'asset_variant_1_part_2.mp4')],
      join(artifactDir, 'asset_variant_1_silent.mp4'),
    );
    expect(concatVideos).not.toHaveBeenCalled();
    expect(muxAudioVideo).toHaveBeenCalledWith(
      join(artifactDir, 'asset_variant_1_silent.mp4'),
      expect.stringContaining('voice.m4a'),
      join(artifactDir, 'asset_variant_1.mp4'),
    );
    const report = JSON.parse(await readFile(join(artifactDir, 'assets.json'), 'utf8')) as {
      assets: Array<{
        status: string;
        videoPath: string;
        durationSec: number;
        segments: Array<{ status: string; durationSec: number; path: string }>;
      }>;
      summary: { success: number; failed: number; skipped: number };
    };
    expect(report.summary).toMatchObject({ success: 1, failed: 0, skipped: 0 });
    expect(report.assets[0]).toMatchObject({
      status: 'success',
      videoPath: join(artifactDir, 'asset_variant_1.mp4'),
      durationSec: 25,
    });
    expect(report.assets[0]?.segments).toEqual([
      expect.objectContaining({
        status: 'success',
        durationSec: 15,
        path: join(artifactDir, 'asset_variant_1_part_1.mp4'),
      }),
      expect.objectContaining({
        status: 'success',
        durationSec: 10,
        path: join(artifactDir, 'asset_variant_1_part_2.mp4'),
      }),
    ]);
  });

  it('records ecommerce segment progress without counting it as final failure', async () => {
    const artifactDir = mkdtempSync(join(tmpdir(), 'native-assets-'));
    const input = {
      industry: 'ecommerce' as const,
      brief: '生成 25 秒轻量机能背包电商广告素材',
      productName: '轻量机能背包',
      variantCount: 1,
      durationSec: 25,
      ratio: '9:16' as const,
    };
    const task: TaskRecord = {
      id: 'task-native',
      type: 'native',
      status: 'running',
      progress: 0,
      input,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      steps: [],
    };
    await writeFile(
      join(artifactDir, 'industry.json'),
      JSON.stringify({
        industry: 'ecommerce',
        title: '电商',
        formula: '场景痛点 + 商品卖点 + 证据背书 + 权益刺激 + CTA',
        durationRange: '15-30s',
        requiredModules: ['商品特写', '使用场景', '卖点对比', '促销权益'],
        complianceFocus: '价格真实性、促销规则、功效承诺、品牌授权',
        hardRules: { blacklistWords: [], forbiddenScenes: [] },
      }),
      'utf8',
    );
    await writeFile(
      join(artifactDir, 'storyboard.json'),
      JSON.stringify({
        variants: [
          {
            index: 1,
            title: '轻量机能背包电商广告',
            script: '先展示普通背包压肩痛点，再展示轻量机能背包分区收纳和限时权益。',
            shots: [
              {
                index: 1,
                durationSec: 15,
                imagePrompt: '通勤人群背着沉重背包走进地铁',
                videoPrompt: '镜头展示肩带勒肩、物品杂乱和通勤疲惫感',
              },
              {
                index: 2,
                durationSec: 10,
                imagePrompt: '轻量机能背包商品特写和收纳展示',
                videoPrompt: '镜头展示电脑、水杯和运动装备有序装入，结尾出现促销权益口播',
              },
            ],
          },
        ],
      }),
      'utf8',
    );

    const step = nativePipeline.steps.find((item) => item.name === 'asset_generator');
    if (step === undefined) {
      throw new Error('asset_generator step missing');
    }

    let progressReport:
      | {
          assets: Array<{ index: number; status?: string; phase?: string; error?: string }>;
          summary: { success: number; failed: number; skipped: number };
        }
      | undefined;
    const modelClient = new NativeMockModelClient(
      [],
      JSON.stringify({ pass: true, issues: [], score: 0.92 }),
      ['asset_variant_1_part_2.mp4'],
      async (request) => {
        if (request.outputPath.endsWith('asset_variant_1_part_2.mp4')) {
          progressReport = JSON.parse(
            await readFile(join(artifactDir, 'assets.json'), 'utf8'),
          ) as typeof progressReport;
        }
      },
    );

    await expect(
      step.runStep({
        task,
        input,
        artifactDir,
        repository: {} as TaskRepository,
        modelClient,
        workflowPrompts: {},
        emitProgress: () => undefined,
      }),
    ).rejects.toThrow(/素材生成部分失败/u);

    expect(progressReport?.summary).toMatchObject({ success: 0, failed: 0, skipped: 0 });
    expect(progressReport?.assets[0]).toMatchObject({
      index: 1,
      phase: 'generating_segments',
      error: '第 1/2 段已生成，等待剩余片段',
    });
    expect(progressReport?.assets[0]?.status).toBeUndefined();

    const finalReport = JSON.parse(await readFile(join(artifactDir, 'assets.json'), 'utf8')) as {
      assets: Array<{
        index: number;
        status?: string;
        phase?: string;
        error?: string;
        segments: Array<{ index: number; status: string; error?: string }>;
      }>;
      summary: { success: number; failed: number; skipped: number };
    };
    expect(finalReport.summary).toMatchObject({ success: 0, failed: 1, skipped: 0 });
    expect(finalReport.assets[0]).toMatchObject({
      index: 1,
      status: 'failed',
      phase: 'failed',
      error: expect.stringContaining('第 2/2 段生成失败'),
    });
    expect(finalReport.assets[0]?.segments).toEqual([
      expect.objectContaining({ index: 1, status: 'success' }),
      expect.objectContaining({
        index: 2,
        status: 'failed',
        error: expect.stringContaining('InvalidParameter detail'),
      }),
    ]);
  });

  it('reuses legacy single-segment native video when muxing voiceover on retry', async () => {
    const artifactDir = mkdtempSync(join(tmpdir(), 'native-assets-'));
    const input = {
      industry: 'tool' as const,
      brief: '生成工具类广告素材',
      productName: '豆包',
      variantCount: 1,
      durationSec: 15,
      ratio: '9:16' as const,
    };
    const task: TaskRecord = {
      id: 'task-native',
      type: 'native',
      status: 'running',
      progress: 0,
      input,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      steps: [],
    };
    await writeFile(
      join(artifactDir, 'industry.json'),
      JSON.stringify({
        industry: 'tool',
        title: '工具',
        formula: '痛点 + 演示 + CTA',
        durationRange: '15-30s',
        requiredModules: ['UI 演示'],
        complianceFocus: '真实承诺',
        hardRules: { blacklistWords: [], forbiddenScenes: [] },
      }),
      'utf8',
    );
    await writeFile(
      join(artifactDir, 'storyboard.json'),
      JSON.stringify({
        variants: [
          {
            index: 1,
            title: '豆包提效',
            script: '展示创作和英语练习。',
            voiceover: '打开豆包，一边创作，一边练英语。',
            shots: [
              {
                index: 1,
                durationSec: 15,
                imagePrompt: '桌面上的电脑界面',
                videoPrompt: '镜头展示豆包创作和英语练习界面',
              },
            ],
          },
        ],
      }),
      'utf8',
    );
    const legacyVideoPath = join(artifactDir, 'asset_variant_1.mp4');
    await writeFile(legacyVideoPath, 'legacy-video', 'utf8');
    await writeFile(
      join(artifactDir, 'assets.json'),
      JSON.stringify({
        assets: [
          {
            index: 1,
            title: '豆包提效',
            status: 'failed',
            videoPath: join(artifactDir, 'asset_variant_1_silent.mp4'),
            error: '旧版本 TTS 失败',
            durationSec: 15,
            segments: [
              {
                index: 1,
                status: 'success',
                path: legacyVideoPath,
                durationSec: 15,
              },
            ],
          },
        ],
      }),
      'utf8',
    );

    const step = nativePipeline.steps.find((item) => item.name === 'asset_generator');
    if (step === undefined) {
      throw new Error('asset_generator step missing');
    }
    const modelClient = new NativeMockModelClient();

    await expect(
      step.runStep({
        task,
        input,
        artifactDir,
        repository: {} as TaskRepository,
        modelClient,
        workflowPrompts: {},
        emitProgress: () => undefined,
      }),
    ).resolves.toEqual({ artifactPath: join(artifactDir, 'assets.json') });

    expect(modelClient.videoRequests).toEqual([]);
    expect(await readFile(join(artifactDir, 'asset_variant_1_silent.mp4'), 'utf8')).toBe(
      'legacy-video',
    );
    expect(muxAudioVideo).toHaveBeenCalledWith(
      join(artifactDir, 'asset_variant_1_silent.mp4'),
      expect.stringContaining('voice.m4a'),
      legacyVideoPath,
    );
    const report = JSON.parse(await readFile(join(artifactDir, 'assets.json'), 'utf8')) as {
      assets: Array<{ status: string; videoPath: string }>;
      summary: { success: number; failed: number; skipped: number };
    };
    expect(report.summary).toMatchObject({ success: 1, failed: 0, skipped: 0 });
    expect(report.assets[0]).toMatchObject({ status: 'success', videoPath: legacyVideoPath });
  });
});
