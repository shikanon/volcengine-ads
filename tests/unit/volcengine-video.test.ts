import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetch } from 'undici';

import { AppError } from '../../src/main/errors.js';
import { VolcengineModelClient } from '../../src/main/model-client/volcengine.js';
import type { RuntimeCredentials } from '../../src/main/secure/keystore.js';

vi.mock('undici', () => ({
  fetch: vi.fn(),
}));

function credentials(): RuntimeCredentials {
  return {
    seedanceApiKey: 'video-key',
    provider: {
      seedanceBaseUrl: 'https://ark.invalid',
      seedanceModel: 'doubao-seedance-2-0-260128',
      imageBaseUrl: 'https://ark.invalid',
      imageModel: 'seedream',
      llmBaseUrl: 'https://ark.invalid',
      llmModel: 'doubao',
      ttsBaseUrl: 'https://speech.invalid',
      ttsVoice: 'voice',
      asrBaseUrl: 'https://openspeech.invalid',
      asrResourceId: 'volc.seedasr.auc',
      ossEndpoint: '',
      ossBucketName: '',
    },
  };
}

function pngHeader(width: number, height: number): Buffer {
  const bytes = Buffer.alloc(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47], 0);
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

describe('VolcengineModelClient.generateVideo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses a Seedance-supported default resolution', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'volcengine-video-'));
    const imagePath = join(dir, 'frame.png');
    const outputPath = join(dir, 'video.mp4');
    writeFileSync(imagePath, Buffer.from('image'));

    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ id: 'task-id' }),
      } as never)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({ status: 'succeeded', video_url: 'https://ark.invalid/video.mp4' }),
      } as never)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        arrayBuffer: async () => Buffer.from('video').buffer,
      } as never);

    await new VolcengineModelClient(credentials()).generateVideo({
      refImagePaths: [imagePath],
      prompt: '生成前贴',
      outputPath,
    });

    const createCall = vi.mocked(fetch).mock.calls[0];
    const init = createCall?.[1] as { body?: string } | undefined;
    expect(JSON.parse(init?.body ?? '{}')).toMatchObject({
      model: 'doubao-seedance-2-0-260128',
      resolution: '720p',
      ratio: 'adaptive',
      generate_audio: false,
    });
  });

  it('passes through generateAudio when Seedance audio is required', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'volcengine-video-'));
    const outputPath = join(dir, 'video.mp4');

    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ id: 'task-id' }),
      } as never)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({ status: 'succeeded', video_url: 'https://ark.invalid/video.mp4' }),
      } as never)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        arrayBuffer: async () => Buffer.from('video').buffer,
      } as never);

    await new VolcengineModelClient(credentials()).generateVideo({
      prompt: '生成带环境声的原生广告素材',
      generateAudio: true,
      outputPath,
    });

    const createCall = vi.mocked(fetch).mock.calls[0];
    const init = createCall?.[1] as { body?: string } | undefined;
    expect(JSON.parse(init?.body ?? '{}')).toMatchObject({ generate_audio: true });
  });

  it('passes through generateAudio for digital human generation', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'volcengine-video-'));
    const imagePath = join(dir, 'avatar.png');
    const audioPath = join(dir, 'speech.mp3');
    const outputPath = join(dir, 'avatar.mp4');
    writeFileSync(imagePath, pngHeader(720, 1280));
    writeFileSync(audioPath, Buffer.from('audio'));

    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ id: 'task-id' }),
      } as never)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({ status: 'succeeded', video_url: 'https://ark.invalid/avatar.mp4' }),
      } as never)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        arrayBuffer: async () => Buffer.from('video').buffer,
      } as never);

    await new VolcengineModelClient(credentials()).generateDigitalHuman({
      avatarImagePath: imagePath,
      audioPath,
      generateAudio: true,
      outputPath,
    });

    const createCall = vi.mocked(fetch).mock.calls[0];
    const init = createCall?.[1] as { body?: string } | undefined;
    expect(JSON.parse(init?.body ?? '{}')).toMatchObject({ generate_audio: true });
  });

  it('passes reference audio content to Seedance when provided', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'volcengine-video-'));
    const audioPath = join(dir, 'voice.mp3');
    const outputPath = join(dir, 'video.mp4');
    writeFileSync(audioPath, Buffer.from('audio'));

    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ id: 'task-id' }),
      } as never)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({ status: 'succeeded', video_url: 'https://ark.invalid/video.mp4' }),
      } as never)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        arrayBuffer: async () => Buffer.from('video').buffer,
      } as never);

    await new VolcengineModelClient(credentials()).generateVideo({
      prompt: '根据口播生成广告画面',
      audioPath,
      outputPath,
    });

    const createCall = vi.mocked(fetch).mock.calls[0];
    const init = createCall?.[1] as { body?: string } | undefined;
    const body = JSON.parse(init?.body ?? '{}') as {
      content?: Array<{ type?: string; role?: string }>;
    };
    expect(body.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'audio_url',
          role: 'reference_audio',
        }),
      ]),
    );
  });

  it('passes through Seedance ratio when provided by the pipeline', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'volcengine-video-'));
    const outputPath = join(dir, 'video.mp4');

    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ id: 'task-id' }),
      } as never)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({ status: 'succeeded', video_url: 'https://ark.invalid/video.mp4' }),
      } as never)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        arrayBuffer: async () => Buffer.from('video').buffer,
      } as never);

    await new VolcengineModelClient(credentials()).generateVideo({
      prompt: '生成 16:9 横版游戏广告素材',
      ratio: '16:9',
      outputPath,
    });

    const createCall = vi.mocked(fetch).mock.calls[0];
    const init = createCall?.[1] as { body?: string } | undefined;
    expect(JSON.parse(init?.body ?? '{}')).toMatchObject({ ratio: '16:9' });
  });

  it('normalizes legacy pixel resolution before requesting Seedance', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'volcengine-video-'));
    const imagePath = join(dir, 'frame.png');
    const outputPath = join(dir, 'video.mp4');
    writeFileSync(imagePath, Buffer.from('image'));

    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ id: 'task-id' }),
      } as never)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({ status: 'succeeded', video_url: 'https://ark.invalid/video.mp4' }),
      } as never)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        arrayBuffer: async () => Buffer.from('video').buffer,
      } as never);

    await new VolcengineModelClient(credentials()).generateVideo({
      refImagePaths: [imagePath],
      prompt: '生成前贴',
      resolution: '1080x1920',
      outputPath,
    });

    const createCall = vi.mocked(fetch).mock.calls[0];
    const init = createCall?.[1] as { body?: string } | undefined;
    expect(JSON.parse(init?.body ?? '{}')).toMatchObject({ resolution: '1080p' });
  });

  it('rejects unsupported Seedance resolution before the network request', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'volcengine-video-'));
    const imagePath = join(dir, 'frame.png');
    writeFileSync(imagePath, Buffer.from('image'));

    await expect(
      new VolcengineModelClient(credentials()).generateVideo({
        refImagePaths: [imagePath],
        prompt: '生成前贴',
        resolution: '540p',
        outputPath: join(dir, 'video.mp4'),
      }),
    ).rejects.toThrow(AppError);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it('rejects unsupported Seedance ratio before the network request', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'volcengine-video-'));

    await expect(
      new VolcengineModelClient(credentials()).generateVideo({
        prompt: '生成前贴',
        ratio: '2:1',
        outputPath: join(dir, 'video.mp4'),
      }),
    ).rejects.toThrow(AppError);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it('rejects Seedance reference images outside the documented size bounds', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'volcengine-video-'));
    const imagePath = join(dir, 'frame.png');
    writeFileSync(imagePath, pngHeader(200, 200));

    await expect(
      new VolcengineModelClient(credentials()).generateVideo({
        refImagePaths: [imagePath],
        prompt: '生成前贴',
        outputPath: join(dir, 'video.mp4'),
      }),
    ).rejects.toThrow(AppError);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it('rejects too many Seedance reference images before the network request', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'volcengine-video-'));
    const imagePaths = Array.from({ length: 10 }, (_, index) => {
      const imagePath = join(dir, `frame-${index}.png`);
      writeFileSync(imagePath, Buffer.from('image'));
      return imagePath;
    });

    await expect(
      new VolcengineModelClient(credentials()).generateVideo({
        refImagePaths: imagePaths,
        prompt: '生成前贴',
        outputPath: join(dir, 'video.mp4'),
      }),
    ).rejects.toThrow(AppError);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it('rejects unsupported Seedance reference video formats', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'volcengine-video-'));
    const videoPath = join(dir, 'source.avi');
    writeFileSync(videoPath, Buffer.from('video'));

    await expect(
      new VolcengineModelClient(credentials()).generateVideo({
        refVideoPath: videoPath,
        prompt: '生成前贴',
        outputPath: join(dir, 'video.mp4'),
      }),
    ).rejects.toThrow(AppError);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it('includes Seedance task status, task id, and raw error details when generation fails', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'volcengine-video-'));
    const outputPath = join(dir, 'video.mp4');
    for (let attempt = 0; attempt < 4; attempt += 1) {
      vi.mocked(fetch)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ id: `task-${attempt}` }),
        } as never)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              status: 'failed',
              error: {
                code: 'InvalidParameter',
                type: 'BadRequest',
                message: 'OK',
              },
            }),
        } as never);
    }

    await expect(
      new VolcengineModelClient(credentials()).generateVideo({
        prompt: '生成前贴',
        outputPath,
      }),
    ).rejects.toThrow(/task_id=task-3.*status=failed.*InvalidParameter.*BadRequest.*raw=/u);
  }, 15_000);

  it('rejects unsupported digital human duration before the network request', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'volcengine-video-'));
    const imagePath = join(dir, 'avatar.png');
    const audioPath = join(dir, 'speech.mp3');
    writeFileSync(imagePath, Buffer.from('image'));
    writeFileSync(audioPath, Buffer.from('audio'));

    await expect(
      new VolcengineModelClient(credentials()).generateDigitalHuman({
        avatarImagePath: imagePath,
        audioPath,
        durationSec: 30,
        outputPath: join(dir, 'avatar.mp4'),
      }),
    ).rejects.toThrow(AppError);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });
});
