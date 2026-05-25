import { mkdtempSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetch } from 'undici';

import { VolcengineModelClient } from '../../src/main/model-client/volcengine.js';
import { AppError } from '../../src/main/errors.js';

vi.mock('undici', () => ({
  fetch: vi.fn(),
}));

function pngHeader(width: number, height: number): Buffer {
  const bytes = Buffer.alloc(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47], 0);
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

describe('VolcengineModelClient.generateImage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls Seedream image generation with a reference image and downloads the result', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'volcengine-image-'));
    const inputPath = join(dir, 'avatar.png');
    const outputPath = join(dir, 'avatar_reference.png');
    writeFileSync(inputPath, Buffer.from('avatar'));

    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            data: [{ url: 'https://ark.invalid/generated.png' }],
          }),
      } as never)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        arrayBuffer: async () => Buffer.from('generated').buffer,
      } as never);

    const client = new VolcengineModelClient({
      imageApiKey: 'image-key',
      provider: {
        seedanceBaseUrl: 'https://ark.invalid',
        seedanceModel: 'seedance',
        imageBaseUrl: 'https://ark.invalid',
        imageModel: 'doubao-seedream-5-0-260128',
        llmBaseUrl: 'https://ark.invalid',
        llmModel: 'doubao',
        ttsBaseUrl: 'https://speech.invalid',
        ttsVoice: 'voice',
        asrBaseUrl: 'https://openspeech.invalid',
        asrResourceId: 'volc.seedasr.auc',
        ossEndpoint: '',
        ossBucketName: '',
      },
    });

    await expect(
      client.generateImage({
        refImagePath: inputPath,
        prompt: '保持角色一致',
        outputPath,
      }),
    ).resolves.toEqual({ localPath: outputPath });

    const createCall = vi.mocked(fetch).mock.calls[0];
    expect(createCall?.[0]).toBe('https://ark.invalid/images/generations');
    const init = createCall?.[1] as { headers?: Record<string, string>; body?: string } | undefined;
    expect(init?.headers?.Authorization).toBe('Bearer image-key');
    expect(JSON.parse(init?.body ?? '{}')).toMatchObject({
      model: 'doubao-seedream-5-0-260128',
      prompt: '保持角色一致',
      size: '2K',
      output_format: 'png',
      response_format: 'url',
      watermark: false,
    });
    expect(JSON.parse(init?.body ?? '{}').image).toContain('data:image/png;base64,');
    await expect(readFile(outputPath, 'utf8')).resolves.toContain('generated');
  });

  it('rejects Seedream reference images that are too small', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'volcengine-image-'));
    const inputPath = join(dir, 'avatar.png');
    writeFileSync(inputPath, pngHeader(10, 10));

    const client = new VolcengineModelClient({
      imageApiKey: 'image-key',
      provider: {
        seedanceBaseUrl: 'https://ark.invalid',
        seedanceModel: 'seedance',
        imageBaseUrl: 'https://ark.invalid',
        imageModel: 'doubao-seedream-5-0-260128',
        llmBaseUrl: 'https://ark.invalid',
        llmModel: 'doubao',
        ttsBaseUrl: 'https://speech.invalid',
        ttsVoice: 'voice',
        asrBaseUrl: 'https://openspeech.invalid',
        asrResourceId: 'volc.seedasr.auc',
        ossEndpoint: '',
        ossBucketName: '',
      },
    });

    await expect(
      client.generateImage({
        refImagePath: inputPath,
        prompt: '保持角色一致',
        outputPath: join(dir, 'avatar_reference.png'),
      }),
    ).rejects.toThrow(AppError);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it('rejects unsupported Seedream output sizes before requesting the API', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'volcengine-image-'));
    const inputPath = join(dir, 'avatar.png');
    writeFileSync(inputPath, pngHeader(512, 512));

    const client = new VolcengineModelClient({
      imageApiKey: 'image-key',
      provider: {
        seedanceBaseUrl: 'https://ark.invalid',
        seedanceModel: 'seedance',
        imageBaseUrl: 'https://ark.invalid',
        imageModel: 'doubao-seedream-5-0-260128',
        llmBaseUrl: 'https://ark.invalid',
        llmModel: 'doubao',
        ttsBaseUrl: 'https://speech.invalid',
        ttsVoice: 'voice',
        asrBaseUrl: 'https://openspeech.invalid',
        asrResourceId: 'volc.seedasr.auc',
        ossEndpoint: '',
        ossBucketName: '',
      },
    });

    await expect(
      client.generateImage({
        refImagePath: inputPath,
        prompt: '保持角色一致',
        size: '1500x1500',
        outputPath: join(dir, 'avatar_reference.png'),
      }),
    ).rejects.toThrow(AppError);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });
});
