import { mkdtempSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TaskRepository } from '../../src/main/db/index.js';
import type {
  AudioResult,
  ImageResult,
  ModelClient,
  SeedanceVideoRequest,
  TranscriptResult,
  VideoResult,
} from '../../src/main/model-client/index.js';
import { concatVideos, replaceAudio } from '../../src/main/media/ffmpeg.js';
import { explosionPipeline } from '../../src/main/pipelines/explosion/index.js';
import type { StepContext } from '../../src/main/pipelines/types.js';
import type { AssetRecord, ExplosionInput, TaskRecord } from '../../src/shared/types.js';

vi.mock('../../src/main/media/ffmpeg.js', () => ({
  concatVideos: vi.fn(async (videoPaths: string[], outputPath: string) => {
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, videoPaths.join('\n'), 'utf8');
    return outputPath;
  }),
  extractAudio: vi.fn(),
  normalizeVideo: vi.fn(),
  replaceAudio: vi.fn(async (_videoPath: string, _audioPath: string, outputPath: string) => {
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, 'replaced-audio', 'utf8');
    return outputPath;
  }),
  trimVideo: vi.fn(async (_inputPath: string, outputPath: string) => {
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, 'reference', 'utf8');
    return outputPath;
  }),
}));

class ExplosionMockModelClient implements ModelClient {
  readonly videoRequests: SeedanceVideoRequest[] = [];

  async generateImage(): Promise<ImageResult> {
    throw new Error('generateImage should not be called');
  }

  async generateVideo(req: SeedanceVideoRequest): Promise<VideoResult> {
    this.videoRequests.push(req);
    await mkdir(dirname(req.outputPath), { recursive: true });
    await writeFile(req.outputPath, `video:${basename(req.outputPath)}`, 'utf8');
    return { localPath: req.outputPath, duration: req.durationSec ?? 10 };
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

  async chat(): Promise<string> {
    throw new Error('chat should not be called');
  }

  async vision(): Promise<string> {
    throw new Error('vision should not be called');
  }

  async visionVideo(): Promise<string> {
    throw new Error('visionVideo should not be called');
  }
}

describe('explosionPipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('splits Seedance generation over the single-call duration limit and chains the previous segment as reference', async () => {
    const artifactDir = mkdtempSync(join(tmpdir(), 'explosion-pipeline-'));
    await writeFile(join(artifactDir, 'source.mp4'), 'source', 'utf8');
    await writeFile(
      join(artifactDir, 'variants.json'),
      JSON.stringify([
        {
          index: 1,
          copy: '立即领取',
          script: '前半段展示痛点，后半段展示解决方案。',
          storyboard: [
            {
              index: 1,
              durationSec: 10,
              visualPrompt: '用户看到旧方案效率很低',
              narration: '还在手动处理素材？',
              transition: '快速切换',
            },
            {
              index: 2,
              durationSec: 8,
              visualPrompt: '展示自动裂变后的多条广告视频',
              narration: '一键生成更多可投放版本。',
              transition: '顺滑推进',
            },
          ],
        },
      ]),
      'utf8',
    );

    const step = explosionPipeline.steps.find((item) => item.name === 'seedance');
    if (step === undefined) {
      throw new Error('seedance step missing');
    }

    const modelClient = new ExplosionMockModelClient();
    const input: ExplosionInput = { sourceVideoPath: join(artifactDir, 'source.mp4'), variantCount: 1 };
    const task: TaskRecord = {
      id: 'task-explosion',
      type: 'explosion',
      status: 'running',
      progress: 0,
      input,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      steps: [],
    };
    const ctx: StepContext<ExplosionInput> = {
      task,
      input,
      artifactDir,
      repository: {} as TaskRepository,
      modelClient,
      workflowPrompts: {},
      emitProgress: () => undefined,
    };

    await step.runStep(ctx);

    const firstRequest = modelClient.videoRequests[0];
    const secondRequest = modelClient.videoRequests[1];
    expect(modelClient.videoRequests).toHaveLength(2);
    expect(firstRequest).toMatchObject({
      durationSec: 10,
      outputPath: join(artifactDir, 'variant_1_part_1.mp4'),
      refVideoPath: join(artifactDir, 'seedance_reference.mp4'),
    });
    expect(secondRequest).toMatchObject({
      durationSec: 8,
      outputPath: join(artifactDir, 'variant_1_part_2.mp4'),
      refVideoPath: firstRequest?.outputPath,
    });
    expect(secondRequest?.prompt).toContain('当前仅生成第 2/2 段');
    expect(concatVideos).toHaveBeenCalledWith(
      [join(artifactDir, 'variant_1_part_1.mp4'), join(artifactDir, 'variant_1_part_2.mp4')],
      join(artifactDir, 'variant_1.mp4'),
    );

    const outputs = JSON.parse(
      await readFile(join(artifactDir, 'seedance_outputs.json'), 'utf8'),
    ) as Array<{ path: string; segments: Array<{ durationSec: number; referenceVideoPath?: string }> }>;
    expect(outputs[0]).toMatchObject({
      path: join(artifactDir, 'variant_1.mp4'),
      segments: [
        { durationSec: 10, referenceVideoPath: join(artifactDir, 'seedance_reference.mp4') },
        { durationSec: 8, referenceVideoPath: join(artifactDir, 'variant_1_part_1.mp4') },
      ],
    });
  });

  it('keeps Seedance audio when ASR transcript is empty', async () => {
    const artifactDir = mkdtempSync(join(tmpdir(), 'explosion-pipeline-'));
    await writeFile(
      join(artifactDir, 'transcript.json'),
      JSON.stringify({ text: '', segments: [] }),
      'utf8',
    );
    await writeFile(
      join(artifactDir, 'variants.json'),
      JSON.stringify([
        {
          index: 1,
          copy: '新品演示',
          script: '只展示场景，没有人声台词。',
          storyboard: [
            {
              index: 1,
              durationSec: 8,
              visualPrompt: '产品使用场景演示',
            },
          ],
        },
      ]),
      'utf8',
    );
    await writeFile(join(artifactDir, 'variant_1.mp4'), 'generated-video-with-audio', 'utf8');

    const step = explosionPipeline.steps.find((item) => item.name === 'audio_replace');
    if (step === undefined) {
      throw new Error('audio_replace step missing');
    }

    const input: ExplosionInput = { sourceVideoPath: join(artifactDir, 'source.mp4'), variantCount: 1 };
    const task: TaskRecord = {
      id: 'task-explosion',
      type: 'explosion',
      status: 'running',
      progress: 0,
      input,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      steps: [],
    };
    const createdAssets: AssetRecord[] = [];
    const repository = {
      createAsset(asset: Omit<AssetRecord, 'id' | 'createdAt'>): AssetRecord {
        const created: AssetRecord = {
          ...asset,
          id: `asset-${createdAssets.length}`,
          createdAt: Date.now(),
        };
        createdAssets.push(created);
        return created;
      },
    } as TaskRepository;
    const ctx: StepContext<ExplosionInput> = {
      task,
      input,
      artifactDir,
      repository,
      modelClient: new ExplosionMockModelClient(),
      workflowPrompts: {},
      emitProgress: () => undefined,
    };

    await step.runStep(ctx);

    const finalPath = join(artifactDir, 'final_1.mp4');
    expect(replaceAudio).not.toHaveBeenCalled();
    await expect(readFile(finalPath, 'utf8')).resolves.toBe('generated-video-with-audio');
    expect(createdAssets[0]?.path).toBe(finalPath);

    const outputs = JSON.parse(
      await readFile(join(artifactDir, 'final_outputs.json'), 'utf8'),
    ) as Array<{ path: string; audioSource: string }>;
    expect(outputs[0]).toMatchObject({ path: finalPath, audioSource: 'seedance' });
  });
});
