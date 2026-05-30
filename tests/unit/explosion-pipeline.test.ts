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
import {
  concatAudioSegments,
  concatSilentVideos,
  replaceAudio,
  trimAudio,
} from '../../src/main/media/ffmpeg.js';
import { explosionPipeline } from '../../src/main/pipelines/explosion/index.js';
import type { StepContext } from '../../src/main/pipelines/types.js';
import type { AssetRecord, ExplosionInput, TaskRecord } from '../../src/shared/types.js';

vi.mock('../../src/main/media/ffmpeg.js', () => ({
  concatSilentVideos: vi.fn(async (videoPaths: string[], outputPath: string) => {
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, videoPaths.join('\n'), 'utf8');
    return outputPath;
  }),
  concatVideos: vi.fn(async (videoPaths: string[], outputPath: string) => {
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `with-audio\n${videoPaths.join('\n')}`, 'utf8');
    return outputPath;
  }),
  concatAudioSegments: vi.fn(async (_segments: unknown[], outputPath: string) => {
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, 'tts-track', 'utf8');
    return outputPath;
  }),
  extractAudio: vi.fn(),
  normalizeVideo: vi.fn(),
  replaceAudio: vi.fn(async (_videoPath: string, _audioPath: string, outputPath: string) => {
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, 'replaced-audio', 'utf8');
    return outputPath;
  }),
  trimAudio: vi.fn(async (_inputPath: string, outputPath: string) => {
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, 'trimmed-audio', 'utf8');
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
  readonly ttsRequests: Array<{ text: string; voice?: string }> = [];

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
      repository: {} as TaskRepository,
      modelClient,
      workflowPrompts: {},
      emitProgress: () => undefined,
    });

    expect(modelClient.videoRequests.map((request) => request.durationSec)).toEqual([4, 12, 4]);
  });

  it('synthesizes per-segment voiceover audio with matched TTS speakers', async () => {
    const artifactDir = mkdtempSync(join(tmpdir(), 'explosion-pipeline-'));
    await writeFile(
      join(artifactDir, 'variants.json'),
      JSON.stringify([
        {
          index: 1,
          copy: '马上体验',
          script: '男声先说痛点，女声再说利益点。',
          storyboard: [
            {
              index: 1,
              durationSec: 4,
              visualPrompt: '男生展示操作繁琐的界面',
              narration: '还在手动剪广告素材吗？',
              voiceGender: 'male',
            },
            {
              index: 2,
              durationSec: 4,
              visualPrompt: '女生展示一键生成多条素材',
              narration: '现在一键就能生成更多版本。',
              voiceGender: 'female',
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

    expect(modelClient.ttsRequests).toEqual([
      {
        text: '还在手动剪广告素材吗？ 现在一键就能生成更多版本。',
        voice: 'zh_male_m191_uranus_bigtts',
      },
    ]);
    expect(trimAudio).toHaveBeenCalledWith(
      expect.stringContaining('voice.mp3'),
      join(artifactDir, 'variant_1_segment_1_voice.mp3'),
      8,
    );
    const prompts = JSON.parse(
      await readFile(join(artifactDir, 'video_prompts.json'), 'utf8'),
    ) as {
      variants: Array<{
        segments: Array<{
          audioPath?: string;
          voiceGender?: string;
          voiceSpeaker?: string;
          voiceoverText?: string;
        }>;
      }>;
    };
    expect(prompts.variants[0]?.segments[0]).toMatchObject({
      audioPath: join(artifactDir, 'variant_1_segment_1_voice.mp3'),
      voiceGender: 'male',
      voiceSpeaker: 'zh_male_m191_uranus_bigtts',
      voiceoverText: '还在手动剪广告素材吗？ 现在一键就能生成更多版本。',
    });
  });

  it('passes optimized voiceover audio into Seedance video generation', async () => {
    const artifactDir = mkdtempSync(join(tmpdir(), 'explosion-pipeline-'));
    const audioPath = join(artifactDir, 'variant_1_segment_1_voice.mp3');
    await writeFile(join(artifactDir, 'source.mp4'), 'source', 'utf8');
    await writeFile(audioPath, 'voice', 'utf8');
    await writeFile(
      join(artifactDir, 'variants.json'),
      JSON.stringify([
        {
          index: 1,
          copy: '立即体验',
          script: '一句口播。',
          storyboard: [{ index: 1, durationSec: 4, visualPrompt: '产品演示', narration: '马上体验' }],
        },
      ]),
      'utf8',
    );
    await writeFile(
      join(artifactDir, 'video_prompts.json'),
      JSON.stringify({
        variants: [
          {
            index: 1,
            segments: [
              {
                index: 1,
                durationSec: 4,
                prompt: '带音频生成',
                noReferencePrompt: '无参考但带音频生成',
                audioPath,
                voiceoverText: '马上体验',
                voiceGender: 'female',
                voiceSpeaker: 'zh_female_vv_uranus_bigtts',
              },
            ],
          },
        ],
      }),
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
      repository: {} as TaskRepository,
      modelClient,
      workflowPrompts: {},
      emitProgress: () => undefined,
    });

    expect(modelClient.videoRequests[0]).toMatchObject({
      audioPath,
      prompt: '带音频生成',
      durationSec: 4,
      generateAudio: true,
    });
    const outputs = JSON.parse(
      await readFile(join(artifactDir, 'seedance_outputs.json'), 'utf8'),
    ) as Array<{ segments: Array<{ audioPath?: string; voiceSpeaker?: string }> }>;
    expect(outputs[0]?.segments[0]).toMatchObject({
      audioPath,
      voiceSpeaker: 'zh_female_vv_uranus_bigtts',
    });
  });

  it('drops voiceover audio on no-reference fallback because Seedance rejects audio-only reference input', async () => {
    const artifactDir = mkdtempSync(join(tmpdir(), 'explosion-pipeline-'));
    const audioPath = join(artifactDir, 'variant_1_segment_1_voice.mp3');
    await writeFile(join(artifactDir, 'source.mp4'), 'source', 'utf8');
    await writeFile(audioPath, 'voice', 'utf8');
    await writeFile(
      join(artifactDir, 'variants.json'),
      JSON.stringify([
        {
          index: 1,
          copy: '立即体验',
          script: '一句口播。',
          storyboard: [{ index: 1, durationSec: 4, visualPrompt: '产品演示', narration: '马上体验' }],
        },
      ]),
      'utf8',
    );
    await writeFile(
      join(artifactDir, 'video_prompts.json'),
      JSON.stringify({
        variants: [
          {
            index: 1,
            segments: [
              {
                index: 1,
                durationSec: 4,
                prompt: '带音频生成',
                noReferencePrompt: '无参考纯文本生成',
                audioPath,
                voiceoverText: '马上体验',
                voiceGender: 'female',
                voiceSpeaker: 'zh_female_vv_uranus_bigtts',
              },
            ],
          },
        ],
      }),
      'utf8',
    );

    const step = explosionPipeline.steps.find((item) => item.name === 'seedance');
    if (step === undefined) {
      throw new Error('seedance step missing');
    }
    const modelClient = new ExplosionMockModelClient();
    let callCount = 0;
    vi.spyOn(modelClient, 'generateVideo').mockImplementation(async (req) => {
      modelClient.videoRequests.push(req);
      callCount += 1;
      if (callCount === 1) {
        throw new Error('reference_video rejected by Seedance');
      }
      await mkdir(dirname(req.outputPath), { recursive: true });
      await writeFile(req.outputPath, 'fallback-video', 'utf8');
      return { localPath: req.outputPath, duration: req.durationSec ?? 4 };
    });
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

    expect(modelClient.videoRequests[0]).toMatchObject({
      audioPath,
      refVideoPath: join(artifactDir, 'seedance_reference.mp4'),
      generateAudio: true,
    });
    expect(modelClient.videoRequests[1]).toMatchObject({
      prompt: '无参考纯文本生成',
      generateAudio: true,
    });
    expect(modelClient.videoRequests[1]?.audioPath).toBeUndefined();
    const outputs = JSON.parse(
      await readFile(join(artifactDir, 'seedance_outputs.json'), 'utf8'),
    ) as Array<{ segments: Array<{ audioPath?: string }> }>;
    expect(outputs[0]?.segments[0]?.audioPath).toBeUndefined();
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

  it('keeps TTS-guided Seedance audio instead of replacing it with source audio', async () => {
    const artifactDir = mkdtempSync(join(tmpdir(), 'explosion-pipeline-'));
    await writeFile(
      join(artifactDir, 'transcript.json'),
      JSON.stringify({ text: '原片有人声', segments: [{ start: 0, end: 1, text: '原片有人声' }] }),
      'utf8',
    );
    await writeFile(
      join(artifactDir, 'variants.json'),
      JSON.stringify([
        {
          index: 1,
          copy: '新品演示',
          script: '新口播。',
          storyboard: [{ index: 1, durationSec: 8, visualPrompt: '产品演示', narration: '新口播' }],
        },
      ]),
      'utf8',
    );
    await writeFile(
      join(artifactDir, 'seedance_outputs.json'),
      JSON.stringify([
        {
          index: 1,
          path: join(artifactDir, 'variant_1.mp4'),
          usedReferenceVideo: true,
          durationSec: 8,
          segments: [{ index: 1, path: join(artifactDir, 'variant_1.mp4'), durationSec: 8, usedReferenceVideo: true, audioPath: join(artifactDir, 'voice.mp3') }],
        },
      ]),
      'utf8',
    );
    await writeFile(join(artifactDir, 'variant_1.mp4'), 'tts-guided-video', 'utf8');

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

    await step.runStep({
      task,
      input,
      artifactDir,
      repository,
      modelClient: new ExplosionMockModelClient(),
      workflowPrompts: {},
      emitProgress: () => undefined,
    });

    const finalPath = join(artifactDir, 'final_1.mp4');
    expect(replaceAudio).not.toHaveBeenCalled();
    await expect(readFile(finalPath, 'utf8')).resolves.toBe('tts-guided-video');
    expect(createdAssets[0]?.path).toBe(finalPath);
    const outputs = JSON.parse(
      await readFile(join(artifactDir, 'final_outputs.json'), 'utf8'),
    ) as Array<{ path: string; audioSource: string }>;
    expect(outputs[0]).toMatchObject({ path: finalPath, audioSource: 'tts_seedance' });
  });

  it('uses synthesized TTS track when Seedance falls back to text-only generation', async () => {
    const artifactDir = mkdtempSync(join(tmpdir(), 'explosion-pipeline-'));
    const audioPath = join(artifactDir, 'voice.mp3');
    await writeFile(audioPath, 'voice', 'utf8');
    await writeFile(
      join(artifactDir, 'transcript.json'),
      JSON.stringify({ text: '原片有人声', segments: [{ start: 0, end: 1, text: '原片有人声' }] }),
      'utf8',
    );
    await writeFile(
      join(artifactDir, 'variants.json'),
      JSON.stringify([
        {
          index: 1,
          copy: '新品演示',
          script: '新口播。',
          storyboard: [{ index: 1, durationSec: 8, visualPrompt: '产品演示', narration: '新口播' }],
        },
      ]),
      'utf8',
    );
    await writeFile(
      join(artifactDir, 'video_prompts.json'),
      JSON.stringify({
        variants: [
          {
            index: 1,
            segments: [
              {
                index: 1,
                durationSec: 8,
                prompt: '带 TTS 的最终提示词',
                noReferencePrompt: '无参考最终提示词',
                audioPath,
                voiceoverText: '新口播',
                voiceGender: 'female',
                voiceSpeaker: 'zh_female_vv_uranus_bigtts',
              },
            ],
          },
        ],
      }),
      'utf8',
    );
    await writeFile(
      join(artifactDir, 'seedance_outputs.json'),
      JSON.stringify([
        {
          index: 1,
          path: join(artifactDir, 'variant_1.mp4'),
          usedReferenceVideo: false,
          durationSec: 8,
          segments: [
            {
              index: 1,
              path: join(artifactDir, 'variant_1.mp4'),
              durationSec: 8,
              usedReferenceVideo: false,
            },
          ],
        },
      ]),
      'utf8',
    );
    await writeFile(join(artifactDir, 'variant_1.mp4'), 'text-only-video', 'utf8');

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
    const repository = {
      createAsset(asset: Omit<AssetRecord, 'id' | 'createdAt'>): AssetRecord {
        return { ...asset, id: 'asset-0', createdAt: Date.now() };
      },
    } as TaskRepository;

    await step.runStep({
      task,
      input,
      artifactDir,
      repository,
      modelClient: new ExplosionMockModelClient(),
      workflowPrompts: {},
      emitProgress: () => undefined,
    });

    const finalPath = join(artifactDir, 'final_1.mp4');
    const ttsTrackPath = join(artifactDir, 'variant_1_tts_track.m4a');
    expect(concatAudioSegments).toHaveBeenCalledWith([{ audioPath, durationSec: 8 }], ttsTrackPath);
    expect(replaceAudio).toHaveBeenCalledWith(join(artifactDir, 'variant_1.mp4'), ttsTrackPath, finalPath);
    await expect(readFile(finalPath, 'utf8')).resolves.toBe('replaced-audio');
    const outputs = JSON.parse(
      await readFile(join(artifactDir, 'final_outputs.json'), 'utf8'),
    ) as Array<{ path: string; audioSource: string }>;
    expect(outputs[0]).toMatchObject({ path: finalPath, audioSource: 'tts_seedance' });
  });
});
