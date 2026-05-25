import { readFile } from 'node:fs/promises';

import { describe, expect, it, vi } from 'vitest';
import { fetch } from 'undici';

import { uploadLocalFileForAsr } from '../../src/main/storage/aliyun-oss.js';

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}));

vi.mock('undici', () => ({
  fetch: vi.fn(),
}));

describe('uploadLocalFileForAsr', () => {
  it('uploads local file to Aliyun OSS and returns signed url', async () => {
    vi.mocked(readFile).mockResolvedValue(Buffer.from('audio'));
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '',
    } as never);

    const result = await uploadLocalFileForAsr(
      {
        ossAccessKeyId: 'ak',
        ossAccessKeySecret: 'sk',
        provider: {
          seedanceBaseUrl: 'https://ark.invalid',
          seedanceModel: 'seedance',
          imageBaseUrl: 'https://ark.invalid',
          imageModel: 'seedream',
          llmBaseUrl: 'https://ark.invalid',
          llmModel: 'doubao',
          ttsBaseUrl: 'https://speech.invalid',
          ttsVoice: 'voice',
          asrBaseUrl: 'https://openspeech.invalid',
          asrResourceId: 'volc.seedasr.auc',
          ossEndpoint: 'https://oss-ap-southeast-1.aliyuncs.com/',
          ossBucketName: 'bucket',
        },
      },
      '/tmp/demo.mp3',
      60,
    );

    expect(result.objectKey).toContain('volcengine-ads/asr/');
    expect(result.signedUrl).toContain('OSSAccessKeyId=ak');
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toContain(
      'https://bucket.oss-ap-southeast-1.aliyuncs.com/',
    );
    expect(vi.mocked(fetch).mock.calls[0]?.[1]).toMatchObject({
      method: 'PUT',
      headers: expect.objectContaining({
        Authorization: expect.stringMatching(/^OSS ak:/),
        'Content-Type': 'audio/mpeg',
      }),
    });
  });
});
