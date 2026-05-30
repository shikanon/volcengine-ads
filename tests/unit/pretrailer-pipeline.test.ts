import { mkdtempSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import type { TaskRepository } from '../../src/main/db/index.js';
import type {
  AudioResult,
  ChatMessage,
  ImageResult,
  ModelClient,
  SeedanceVideoRequest,
  TranscriptResult,
  VideoResult,
} from '../../src/main/model-client/index.js';
import { concatWithFade } from '../../src/main/media/ffmpeg.js';
import { pretrailerPipeline } from '../../src/main/pipelines/pretrailer/index.js';
import type { AssetRecord, PretrailerInput, TaskRecord } from '../../src/shared/types.js';

vi.mock('../../src/main/media/ffmpeg.js', async () => {
  const { mkdir, writeFile } = await import('node:fs/promises');
  const { dirname } = await import('node:path');
  return {
    concatWithFade: vi.fn(
      async (
        _firstPath: string,
        _secondPath: string,
        outputPath: string,
      ) => {
        await mkdir(dirname(outputPath), { recursive: true });
        await writeFile(outputPath, 'concat-with-fade', 'utf8');
        return outputPath;
      },
    ),
    extractAudio: vi.fn(),
    muxAudioVideo: vi.fn(),
    normalizeVideo: vi.fn(),
  };
});

class PretrailerMockModelClient implements ModelClient {
  readonly videoRequests: SeedanceVideoRequest[] = [];
  readonly videoUnderstandRequests: Array<{ videoPath: string; prompt: string }> = [];
  readonly chatRequests: ChatMessage[][] = [];

  async generateImage(): Promise<ImageResult> {
    throw new Error('generateImage should not be called');
  }

  async generateVideo(req: SeedanceVideoRequest): Promise<VideoResult> {
    this.videoRequests.push(req);
    await mkdir(dirname(req.outputPath), { recursive: true });
    await writeFile(req.outputPath, `video:${basename(req.outputPath)}`, 'utf8');
    return { localPath: req.outputPath, duration: req.durationSec ?? 7 };
  }

  async generateDigitalHuman(): Promise<VideoResult> {
    throw new Error('generateDigitalHuman should not be called');
  }

  async asr(): Promise<TranscriptResult> {
    throw new Error('asr should not be called');
  }

  async tts(): Promise<AudioResult> {
    throw new Error('tts should not be called');
  }

  async chat(messages: ChatMessage[]): Promise<string> {
    this.chatRequests.push(messages);
    return JSON.stringify({ text: '清脆切开所有犹豫，马上看到结果', hookAtSec: 0.5 });
  }

  async vision(): Promise<string> {
    throw new Error('vision should not be called');
  }

  async visionVideo(videoPath: string, prompt: string): Promise<string> {
    this.videoUnderstandRequests.push({ videoPath, prompt });
    return JSON.stringify({
      confidence: 0.9,
      category: '工具',
      sellingPoints: ['高效生成'],
      visualStyle: '手机界面、明亮色调、居中构图、快速推进镜头',
      audience: '内容创作者',
    });
  }
}

describe('pretrailerPipeline', () => {
  it('injects the selected pretrailer video generation type template into copy generation', async () => {
    const artifactDir = mkdtempSync(join(tmpdir(), 'pretrailer-pipeline-'));
    const input: PretrailerInput = {
      sourceVideoPath: join(artifactDir, 'source-input.mp4'),
      pretrailerDuration: 7,
      style: 'asmr',
    };
    const task: TaskRecord = {
      id: 'task-pretrailer',
      type: 'pretrailer',
      status: 'running',
      progress: 0,
      input,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      steps: [],
    };
    await writeFile(
      join(artifactDir, 'understanding.json'),
      JSON.stringify({
        confidence: 0.9,
        category: '工具',
        sellingPoints: ['高效生成'],
        visualStyle: '手机界面、明亮色调、居中构图、快速推进镜头',
        audience: '内容创作者',
      }),
      'utf8',
    );
    const step = pretrailerPipeline.steps.find((item) => item.name === 'copy_gen');
    if (step === undefined) {
      throw new Error('copy_gen step missing');
    }
    const modelClient = new PretrailerMockModelClient();

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
    ).resolves.toEqual({ artifactPath: join(artifactDir, 'copy.json') });

    expect(modelClient.chatRequests[0]?.[1]?.content).toEqual(
      expect.stringContaining('ASMR前贴：采用 AI 切万物 ASMR'),
    );
    expect(modelClient.chatRequests[0]?.[1]?.content).toEqual(
      expect.stringContaining('清脆、治愈的 ASMR 切割声'),
    );
  });

  it('understands pretrailer source video directly without image keyframes', async () => {
    const artifactDir = mkdtempSync(join(tmpdir(), 'pretrailer-pipeline-'));
    const input: PretrailerInput = {
      sourceVideoPath: join(artifactDir, 'source-input.mp4'),
      pretrailerDuration: 7,
      style: 'benefit',
      resolution: '1080p',
    };
    const task: TaskRecord = {
      id: 'task-pretrailer',
      type: 'pretrailer',
      status: 'running',
      progress: 0,
      input,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      steps: [],
    };
    await writeFile(join(artifactDir, 'source.mp4'), 'source-video', 'utf8');
    const step = pretrailerPipeline.steps.find((item) => item.name === 'understand');
    if (step === undefined) {
      throw new Error('understand step missing');
    }
    const modelClient = new PretrailerMockModelClient();

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
    ).resolves.toEqual({ artifactPath: join(artifactDir, 'understanding.json') });

    expect(modelClient.videoUnderstandRequests).toEqual([
      expect.objectContaining({
        videoPath: join(artifactDir, 'source.mp4'),
        prompt: expect.stringContaining('直接观看完整广告视频'),
      }),
    ]);
  });

  it('generates pretrailer video without keyframe reference images', async () => {
    const artifactDir = mkdtempSync(join(tmpdir(), 'pretrailer-pipeline-'));
    const input: PretrailerInput = {
      sourceVideoPath: join(artifactDir, 'source-input.mp4'),
      pretrailerDuration: 7,
      style: 'benefit',
      resolution: '1080p',
    };
    const task: TaskRecord = {
      id: 'task-pretrailer',
      type: 'pretrailer',
      status: 'running',
      progress: 0,
      input,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      steps: [],
    };
    await writeFile(
      join(artifactDir, 'script.json'),
      JSON.stringify({
        shots: [{ index: 1, durationSec: 1, prompt: '延续原片产品、色调和构图的强钩子镜头' }],
      }),
      'utf8',
    );

    const step = pretrailerPipeline.steps.find((item) => item.name === 'seedance');
    if (step === undefined) {
      throw new Error('seedance step missing');
    }
    const modelClient = new PretrailerMockModelClient();

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
    ).resolves.toEqual({ artifactPath: join(artifactDir, 'pretrailer.mp4') });

    expect(modelClient.videoRequests).toHaveLength(1);
    expect(modelClient.videoRequests[0]).toMatchObject({
      durationSec: 7,
      resolution: '1080p',
      generateAudio: true,
      outputPath: join(artifactDir, 'pretrailer.mp4'),
    });
    expect(modelClient.videoRequests[0]?.refImagePaths).toBeUndefined();
  });

  it('normalizes pretrailer Seedance request duration to the single-call range', async () => {
    const artifactDir = mkdtempSync(join(tmpdir(), 'pretrailer-pipeline-'));
    const input: PretrailerInput = {
      sourceVideoPath: join(artifactDir, 'source-input.mp4'),
      pretrailerDuration: 2,
      style: 'benefit',
    };
    const task: TaskRecord = {
      id: 'task-pretrailer',
      type: 'pretrailer',
      status: 'running',
      progress: 0,
      input,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      steps: [],
    };
    await writeFile(
      join(artifactDir, 'script.json'),
      JSON.stringify({
        shots: [{ index: 1, durationSec: 1, prompt: '首秒强钩子镜头' }],
      }),
      'utf8',
    );

    const step = pretrailerPipeline.steps.find((item) => item.name === 'seedance');
    if (step === undefined) {
      throw new Error('seedance step missing');
    }
    const modelClient = new PretrailerMockModelClient();

    await step.runStep({
      task,
      input,
      artifactDir,
      repository: {} as TaskRepository,
      modelClient,
      workflowPrompts: {},
      emitProgress: () => undefined,
    });

    expect(modelClient.videoRequests[0]?.durationSec).toBe(4);
  });

  it('passes pretrailer duration to fade concat so xfade starts at the segment tail', async () => {
    const artifactDir = mkdtempSync(join(tmpdir(), 'pretrailer-pipeline-'));
    const input: PretrailerInput = {
      sourceVideoPath: join(artifactDir, 'source-input.mp4'),
      pretrailerDuration: 7,
      style: 'benefit',
    };
    const task: TaskRecord = {
      id: 'task-pretrailer',
      type: 'pretrailer',
      status: 'running',
      progress: 0,
      input,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      steps: [],
    };
    const createdAssets: AssetRecord[] = [];
    const step = pretrailerPipeline.steps.find((item) => item.name === 'concat');
    if (step === undefined) {
      throw new Error('concat step missing');
    }

    await expect(
      step.runStep({
        task,
        input,
        artifactDir,
        repository: {
          createAsset(asset: Omit<AssetRecord, 'id' | 'createdAt'>): AssetRecord {
            const created = { ...asset, id: `asset-${createdAssets.length}`, createdAt: Date.now() };
            createdAssets.push(created);
            return created;
          },
        } as TaskRepository,
        modelClient: new PretrailerMockModelClient(),
        workflowPrompts: {},
        emitProgress: () => undefined,
      }),
    ).resolves.toEqual({
      artifactPath: join(artifactDir, 'final.mp4'),
      logs: 'xfade transition=fade:duration=0.4',
    });

    expect(concatWithFade).toHaveBeenCalledWith(
      join(artifactDir, 'pretrailer_av.mp4'),
      join(artifactDir, 'source.mp4'),
      join(artifactDir, 'final.mp4'),
      { firstDurationSec: 7 },
    );
    expect(createdAssets).toEqual([
      expect.objectContaining({
        kind: 'video',
        path: join(artifactDir, 'final.mp4'),
        tags: ['pretrailer'],
      }),
    ]);
  });
});
