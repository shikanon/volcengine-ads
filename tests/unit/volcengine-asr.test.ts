import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fetch } from 'undici';

import { VolcengineModelClient } from '../../src/main/model-client/volcengine.js';
import { uploadLocalFileForAsr } from '../../src/main/storage/aliyun-oss.js';

vi.mock('undici', () => ({
  fetch: vi.fn(),
}));

vi.mock('../../src/main/storage/aliyun-oss.js', () => ({
  uploadLocalFileForAsr: vi.fn(),
}));

interface MockHeaders {
  get(name: string): string | null;
}

interface MockFetchResponse {
  ok: boolean;
  status: number;
  headers: MockHeaders;
  json(): Promise<unknown>;
}

function response(statusCode: string, body: unknown = {}): MockFetchResponse {
  return {
    ok: true,
    status: 200,
    headers: {
      get(name: string) {
        if (name.toLowerCase() === 'x-api-status-code') {
          return statusCode;
        }
        if (name.toLowerCase() === 'x-api-message') {
          return 'OK';
        }
        return null;
      },
    },
    async json() {
      return body;
    },
  };
}

describe('VolcengineModelClient.asr', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('submits and polls Volc ASR AUC tasks with old-console credentials', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(response('20000000') as never).mockResolvedValueOnce(
      response('20000000', {
        result: {
          text: '测试文本。',
          utterances: [{ start_time: 0, end_time: 1200, text: '测试文本。' }],
        },
      }) as never,
    );

    const client = new VolcengineModelClient({
      asrAppId: 'appid',
      asrToken: 'token',
      provider: {
        seedanceBaseUrl: 'https://ark.invalid',
        seedanceModel: 'seedance',
        imageBaseUrl: 'https://ark.invalid',
        imageModel: 'seedream',
        llmBaseUrl: 'https://ark.invalid',
        llmModel: 'doubao',
        ttsBaseUrl: 'https://speech.invalid',
        ttsVoice: 'voice',
        asrBaseUrl: 'https://openspeech.bytedance.com',
        asrResourceId: 'volc.seedasr.auc',
        ossEndpoint: '',
        ossBucketName: '',
      },
    });

    await expect(client.asr('https://example.com/demo.wav')).resolves.toEqual({
      text: '测试文本。',
      segments: [{ start: 0, end: 1.2, text: '测试文本。' }],
    });

    const firstCall = fetchMock.mock.calls[0];
    expect(firstCall?.[0]).toBe('https://openspeech.bytedance.com/api/v3/auc/bigmodel/submit');
    const init = firstCall?.[1] as { headers?: Record<string, string>; body?: string } | undefined;
    expect(init?.headers?.['X-Api-App-Key']).toBe('appid');
    expect(init?.headers?.['X-Api-Access-Key']).toBe('token');
    expect(init?.headers?.['X-Api-Resource-Id']).toBe('volc.seedasr.auc');
    expect(JSON.parse(init?.body ?? '{}')).toMatchObject({
      audio: { url: 'https://example.com/demo.wav', format: 'wav' },
      request: { model_name: 'bigmodel', show_utterances: true },
    });
  });

  it('uploads local audio before submitting ASR task', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'volcengine-asr-'));
    const audioPath = join(dir, 'local.mp3');
    writeFileSync(audioPath, Buffer.from('audio'));

    vi.mocked(uploadLocalFileForAsr).mockResolvedValue({
      objectKey: 'volcengine-ads/asr/demo.mp3',
      signedUrl: 'https://bucket.oss/demo.mp3?Signature=sig',
    });
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(response('20000000') as never).mockResolvedValueOnce(
      response('20000000', {
        result: {
          text: '本地上传转写。',
          utterances: [{ start_time: 100, end_time: 1500, text: '本地上传转写。' }],
        },
      }) as never,
    );

    const client = new VolcengineModelClient({
      asrAppId: 'appid',
      asrToken: 'token',
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
        asrBaseUrl: 'https://openspeech.bytedance.com',
        asrResourceId: 'volc.seedasr.auc',
        ossEndpoint: 'https://oss-ap-southeast-1.aliyuncs.com/',
        ossBucketName: 'bucket',
      },
    });

    await expect(client.asr(audioPath)).resolves.toEqual({
      text: '本地上传转写。',
      segments: [{ start: 0.1, end: 1.5, text: '本地上传转写。' }],
    });
    expect(uploadLocalFileForAsr).toHaveBeenCalledWith(expect.any(Object), audioPath);
    const init = fetchMock.mock.calls[0]?.[1] as { body?: string } | undefined;
    expect(JSON.parse(init?.body ?? '{}')).toMatchObject({
      audio: { url: 'https://bucket.oss/demo.mp3?Signature=sig' },
    });
  });
});
