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
import { concatSilentVideos } from '../../src/main/media/ffmpeg.js';
import { explosionPipeline } from '../../src/main/pipelines/explosion/index.js';
import type { StepContext } from '../../src/main/pipelines/types.js';
import type { AssetRecord, ExplosionInput, TaskRecord } from '../../src/shared/types.js';

vi.mock('../../src/main/media/ffmpeg.js', () => ({
  concatSilentVideos: vi.fn(async (videoPaths: string[], outputPath: string) => {
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, videoPaths.join('\n'), 'utf8');
    return outputPath;
  }),
  extractAudio: vi.fn(),
  normalizeVideo: vi.fn(),
  trimVideo: vi.fn(async (_inputPath: string, outputPath: string) => {
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, 'reference', 'utf8');
    return outputPath;
  }),
}));

class ExplosionMockModelClient implements ModelClient {
  readonly videoRequests: SeedanceVideoRequest[] = [];
  readonly ttsRequests: Array<{ text: string; voice?: string }> = [];

  constructor(private readonly chatResponse?: string) {}

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

  async tts(text: string, voice?: string): Promise<AudioResult> {
    this.ttsRequests.push({ text, ...(voice !== undefined ? { voice } : {}) });
    const localPath = join(mkdtempSync(join(tmpdir(), 'explosion-tts-')), 'voice.mp3');
    await writeFile(localPath, `audio:${text}:${voice ?? ''}`, 'utf8');
    return { localPath, duration: 0 };
  }

  async chat(): Promise<string> {
    if (this.chatResponse !== undefined) {
      return this.chatResponse;
    }
    throw new Error('chat should not be called');
  }

  async webSearch(): Promise<never> {
    throw new Error('webSearch should not be called');
  }

  async vision(): Promise<string> {
    throw new Error('vision should not be called');
  }

  async visionVideo(): Promise<string> {
    throw new Error('visionVideo should not be called');
  }
}

function createAssetRepository(createdAssets: AssetRecord[] = []): TaskRepository {
  return {
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
}

describe('explosionPipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not fail rewrite when CTA keywords are paraphrased before script confirmation', async () => {
    const artifactDir = mkdtempSync(join(tmpdir(), 'explosion-pipeline-'));
    await writeFile(
      join(artifactDir, 'transcript.json'),
      JSON.stringify({ text: '立即下载，免费领取权益。' }),
      'utf8',
    );
    await writeFile(
      join(artifactDir, 'script_parse.json'),
      JSON.stringify({
        cta_keywords: ['立即下载', '免费领取'],
        scenes: [{ index: 1, visualPrompt: '展示产品权益' }],
      }),
      'utf8',
    );

    const step = explosionPipeline.steps.find((item) => item.name === 'rewrite');
    if (step === undefined) {
      throw new Error('rewrite step missing');
    }
    const modelClient = new ExplosionMockModelClient(
      JSON.stringify([
        {
          index: 1,
          strategy: 'remix',
          copy: '现在就试试，把权益领到手。',
          script: '开头展示痛点，中段展示权益，结尾引导用户立刻行动。',
          preserve: ['转化触发点'],
          replace: ['画面表达'],
          differenceTarget: '更换使用场景',
          variantReason: '避免同质化',
          storyboard: [
            {
              index: 1,
              durationSec: 4,
              visualPrompt: '用户看到权益领取入口',
              narration: '现在就试试，把权益领到手。',
              transition: '快速切换',
            },
          ],
        },
      ]),
    );
    const appendLog = vi.fn(async () => undefined);
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

    await expect(
      step.runStep({
        task,
        input,
        artifactDir,
        repository: {} as TaskRepository,
        modelClient,
        workflowPrompts: {},
        emitProgress: () => undefined,
        appendLog,
      }),
    ).resolves.toMatchObject({ artifactPath: join(artifactDir, 'variants.json') });

    await expect(readFile(join(artifactDir, 'variants.md'), 'utf8')).resolves.toContain('现在就试试');
    expect(appendLog).toHaveBeenCalledWith(
      'warn',
      '裂变改写未逐字保留部分 CTA 关键词，进入脚本文案确认环节复核',
      {
        variants: [{ index: 1, missingKeywords: ['立即下载', '免费领取'] }],
      },
    );
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
    const input: ExplosionInput = {
      sourceVideoPath: join(artifactDir, 'source.mp4'),
      variantCount: 1,
      resolution: '480p',
    };
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
      repository: createAssetRepository(),
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
      resolution: '480p',
      ratio: '9:16',
      outputPath: join(artifactDir, 'variant_1_part_1.mp4'),
      refVideoPath: join(artifactDir, 'seedance_reference.mp4'),
    });
    expect(secondRequest).toMatchObject({
      durationSec: 8,
      resolution: '480p',
      outputPath: join(artifactDir, 'variant_1_part_2.mp4'),
      refVideoPath: firstRequest?.outputPath,
    });
    expect(secondRequest?.prompt).toContain('当前仅生成第 2/2 段');
    expect(secondRequest?.prompt).toContain('参考该视频的主体位置');
    expect(concatSilentVideos).toHaveBeenCalledWith(
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

  it('normalizes model-authored storyboard durations before Seedance generation', async () => {
    const artifactDir = mkdtempSync(join(tmpdir(), 'explosion-pipeline-'));
    await writeFile(join(artifactDir, 'source.mp4'), 'source', 'utf8');
    await writeFile(
      join(artifactDir, 'variants.json'),
      JSON.stringify([
        {
          index: 1,
          copy: '立即体验',
          script: '先给强钩子，再展示完整转化场景。',
          storyboard: [
            { index: 1, durationSec: 1, visualPrompt: '首秒强钩子' },
            { index: 2, durationSec: 16, visualPrompt: '连续展示产品使用场景' },
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

    await step.runStep({
      task,
      input,
      artifactDir,
      repository: createAssetRepository(),
      modelClient,
      workflowPrompts: {},
      emitProgress: () => undefined,
    });

    expect(modelClient.videoRequests.map((request) => request.durationSec)).toEqual([4, 12, 4]);
  });

  it('keeps explosion video prompt optimization text-only without TTS artifacts', async () => {
    const artifactDir = mkdtempSync(join(tmpdir(), 'explosion-pipeline-'));
    await writeFile(
      join(artifactDir, 'variants.json'),
      JSON.stringify([
        {
          index: 1,
          copy: '马上体验',
          script: '先说痛点，再说利益点。',
          storyboard: [
            {
              index: 1,
              durationSec: 4,
              visualPrompt: '用户展示操作繁琐的界面',
              narration: '还在手动剪广告素材吗？',
            },
          ],
        },
      ]),
      'utf8',
    );

    const step = explosionPipeline.steps.find((item) => item.name === 'video_prompt_optimize');
    if (step === undefined) {
      throw new Error('video_prompt_optimize step missing');
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

    await step.runStep({
      task,
      input,
      artifactDir,
      repository: {} as TaskRepository,
      modelClient,
      workflowPrompts: {},
      emitProgress: () => undefined,
    });

    expect(modelClient.ttsRequests).toHaveLength(0);
    const prompts = JSON.parse(
      await readFile(join(artifactDir, 'video_prompts.json'), 'utf8'),
    ) as {
      variants: Array<{
        segments: Array<{ audioPath?: string; prompt: string; noReferencePrompt: string }>;
      }>;
    };
    expect(prompts.variants[0]?.segments[0]?.audioPath).toBeUndefined();
    expect(prompts.variants[0]?.segments[0]?.prompt).toContain('不额外传入 reference_audio');
  });
});
