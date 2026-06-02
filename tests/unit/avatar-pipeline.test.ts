import { mkdtempSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import type { TaskRepository } from '../../src/main/db/index.js';
import type {
  AudioResult,
  ImageResult,
  ModelClient,
  SeedanceAvatarRequest,
  TranscriptResult,
  VideoResult,
} from '../../src/main/model-client/index.js';
import { transcodeAudioToMp3 } from '../../src/main/media/ffmpeg.js';
import { avatarPipeline } from '../../src/main/pipelines/avatar/index.js';
import type { AvatarInput, TaskRecord } from '../../src/shared/types.js';

vi.mock('../../src/main/media/ffmpeg.js', async () => {
  const { mkdir, writeFile } = await import('node:fs/promises');
  const { dirname } = await import('node:path');
  return {
    concatVideos: vi.fn(async (videoPaths: string[], outputPath: string) => {
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, videoPaths.join('\n'), 'utf8');
      return outputPath;
    }),
    overlayProductImages: vi.fn(async (_videoPath: string, _productImagePaths: string[], outputPath: string) => {
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, 'overlay', 'utf8');
      return outputPath;
    }),
    transcodeAudioToMp3: vi.fn(async (_inputPath: string, outputPath: string) => {
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, 'mp3-audio', 'utf8');
      return outputPath;
    }),
  };
});

class AvatarMockModelClient implements ModelClient {
  readonly digitalHumanRequests: SeedanceAvatarRequest[] = [];
  readonly ttsTexts: string[] = [];

  async generateImage(): Promise<ImageResult> {
    throw new Error('generateImage should not be called');
  }

  async generateVideo(): Promise<VideoResult> {
    throw new Error('generateVideo should not be called');
  }

  async generateDigitalHuman(req: SeedanceAvatarRequest): Promise<VideoResult> {
    this.digitalHumanRequests.push(req);
    await mkdir(dirname(req.outputPath), { recursive: true });
    await writeFile(req.outputPath, 'avatar-video', 'utf8');
    return { localPath: req.outputPath, duration: req.durationSec ?? 15 };
  }

  async asr(): Promise<TranscriptResult> {
    throw new Error('asr should not be called');
  }

  async tts(text: string): Promise<AudioResult> {
    this.ttsTexts.push(text);
    const localPath = join(mkdtempSync(join(tmpdir(), 'avatar-tts-')), 'voice.mp3');
    await writeFile(localPath, 'audio', 'utf8');
    return { localPath, duration: 4 };
  }

  async chat(): Promise<string> {
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

function createTask(input: AvatarInput): TaskRecord {
  return {
    id: 'task-avatar',
    type: 'avatar',
    status: 'running',
    progress: 0,
    input,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    steps: [],
  };
}

function createInput(artifactDir: string): AvatarInput {
  return {
    avatarImagePath: join(artifactDir, 'avatar.png'),
    productImagePaths: [join(artifactDir, 'product.png')],
    brandIntro: '轻量高效的内容工具',
    duration: 10,
  };
}

describe('avatarPipeline', () => {
  it('stores TTS output as mp3 for Seedance digital human audio input', async () => {
    const artifactDir = mkdtempSync(join(tmpdir(), 'avatar-pipeline-'));
    const input = createInput(artifactDir);
    const step = avatarPipeline.steps.find((item) => item.name === 'tts');
    if (step === undefined) {
      throw new Error('tts step missing');
    }
    await writeFile(
      join(artifactDir, 'script.json'),
      JSON.stringify({
        text: '这里是一段数字人口播文案',
        differentiators: ['高效', '稳定'],
        timeline: [],
      }),
      'utf8',
    );

    await expect(
      step.runStep({
        task: createTask(input),
        input,
        artifactDir,
        repository: {} as TaskRepository,
        modelClient: new AvatarMockModelClient(),
        workflowPrompts: {},
        emitProgress: () => undefined,
      }),
    ).resolves.toEqual({ artifactPath: join(artifactDir, 'voice.mp3') });
  });

  it('converts legacy m4a voice artifact before Seedance digital human generation', async () => {
    const artifactDir = mkdtempSync(join(tmpdir(), 'avatar-pipeline-'));
    const input = { ...createInput(artifactDir), duration: 2, resolution: '1080p' as const };
    const step = avatarPipeline.steps.find((item) => item.name === 'seedance_avatar');
    if (step === undefined) {
      throw new Error('seedance_avatar step missing');
    }
    await writeFile(join(artifactDir, 'avatar_reference.png'), 'image', 'utf8');
    await writeFile(join(artifactDir, 'voice.m4a'), 'legacy-audio', 'utf8');
    const modelClient = new AvatarMockModelClient();

    await expect(
      step.runStep({
        task: createTask(input),
        input,
        artifactDir,
        repository: {} as TaskRepository,
        modelClient,
        workflowPrompts: {},
        emitProgress: () => undefined,
      }),
    ).resolves.toEqual({ artifactPath: join(artifactDir, 'avatar.mp4') });

    expect(transcodeAudioToMp3).toHaveBeenCalledWith(
      join(artifactDir, 'voice.m4a'),
      join(artifactDir, 'voice.mp3'),
    );
    expect(modelClient.digitalHumanRequests[0]?.audioPath).toBe(join(artifactDir, 'voice.mp3'));
    expect(modelClient.digitalHumanRequests[0]?.durationSec).toBe(4);
    expect(modelClient.digitalHumanRequests[0]?.resolution).toBe('1080p');
    expect(modelClient.digitalHumanRequests[0]?.generateAudio).toBe(true);
  });

  it('splits long digital human scripts into multiple Seedance-compatible segments', async () => {
    const artifactDir = mkdtempSync(join(tmpdir(), 'avatar-pipeline-'));
    const input = { ...createInput(artifactDir), duration: 30 };
    const ttsStep = avatarPipeline.steps.find((item) => item.name === 'tts');
    const seedanceStep = avatarPipeline.steps.find((item) => item.name === 'seedance_avatar');
    if (ttsStep === undefined || seedanceStep === undefined) {
      throw new Error('avatar steps missing');
    }
    await writeFile(join(artifactDir, 'avatar_reference.png'), 'image', 'utf8');
    await writeFile(
      join(artifactDir, 'script.json'),
      JSON.stringify({
        text: '第一句介绍品牌优势。第二句展示核心卖点。第三句强调使用场景。第四句引导立即体验。',
        differentiators: ['高效', '稳定'],
        timeline: [],
      }),
      'utf8',
    );
    const modelClient = new AvatarMockModelClient();
    const ctx = {
      task: createTask(input),
      input,
      artifactDir,
      repository: {} as TaskRepository,
      modelClient,
      workflowPrompts: {},
      emitProgress: () => undefined,
    };

    await expect(ttsStep.runStep(ctx)).resolves.toMatchObject({
      artifactPath: join(artifactDir, 'voice_segments.json'),
    });
    await expect(seedanceStep.runStep(ctx)).resolves.toMatchObject({
      artifactPath: join(artifactDir, 'avatar.mp4'),
      logs: '已生成 2 段并拼接，单段时长 15s + 15s',
    });

    expect(modelClient.ttsTexts).toHaveLength(2);
    expect(modelClient.digitalHumanRequests.map((request) => request.durationSec)).toEqual([15, 15]);
    expect(modelClient.digitalHumanRequests.map((request) => request.outputPath)).toEqual([
      join(artifactDir, 'avatar_part_1.mp4'),
      join(artifactDir, 'avatar_part_2.mp4'),
    ]);
    expect(modelClient.digitalHumanRequests[0]?.audioPath).toBe(join(artifactDir, 'voice_part_1.mp3'));
    expect(modelClient.digitalHumanRequests[1]?.audioPath).toBe(join(artifactDir, 'voice_part_2.mp3'));
    expect(modelClient.digitalHumanRequests.map((request) => request.generateAudio)).toEqual([true, true]);
  });
});
