import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
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
    llmApiKey: 'llm-key',
    ttsApiKey: 'tts-api-key',
    asrApiKey: 'asr-key',
    provider: {
      seedanceBaseUrl: 'https://ark.invalid',
      seedanceModel: 'doubao-seedance-2-0-260128',
      imageBaseUrl: 'https://ark.invalid',
      imageModel: 'doubao-seedream-5-0-260128',
      llmBaseUrl: 'https://ark.invalid',
      llmModel: 'doubao-seed-2-0-pro-260215',
      ttsBaseUrl: 'https://speech.invalid',
      ttsVoice: 'zh_female_vv_uranus_bigtts',
      asrBaseUrl: 'https://openspeech.invalid',
      asrResourceId: 'volc.seedasr.auc',
      ossEndpoint: '',
      ossBucketName: '',
    },
  };
}

describe('VolcengineModelClient input validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects empty LLM multimodal parts before the network request', async () => {
    await expect(
      new VolcengineModelClient(credentials()).chat([
        {
          role: 'user',
          content: [{ type: 'text', text: '  ' }],
        },
      ]),
    ).rejects.toThrow(AppError);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it('rejects invalid LLM temperature before the network request', async () => {
    await expect(
      new VolcengineModelClient(credentials()).chat([{ role: 'user', content: '你好' }], {
        temperature: 3,
      }),
    ).rejects.toThrow(AppError);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it('rejects overlong TTS text before the network request', async () => {
    await expect(
      new VolcengineModelClient(credentials()).tts('测'.repeat(1001), 'zh_female_vv_uranus_bigtts'),
    ).rejects.toThrow(AppError);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it('rejects unsupported TTS speakers before the network request', async () => {
    await expect(
      new VolcengineModelClient(credentials()).tts('语音合成测试', 'unknown-speaker'),
    ).rejects.toThrow(AppError);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it('accepts TTS audio chunks followed by the OK terminal packet', async () => {
    const audioChunk = Buffer.from('voice-audio').toString('base64');
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () =>
        [
          JSON.stringify({ code: 0, message: '', data: audioChunk }),
          JSON.stringify({ code: 20000000, message: 'OK' }),
        ].join('\n'),
    } as never);

    const result = await new VolcengineModelClient(credentials()).tts('语音合成测试');

    expect(existsSync(result.localPath)).toBe(true);
    expect(readFileSync(result.localPath).toString()).toBe('voice-audio');
    const init = vi.mocked(fetch).mock.calls[0]?.[1] as
      | { headers?: Record<string, string>; body?: string }
      | undefined;
    expect(init?.headers?.['X-Api-Key']).toBe('tts-api-key');
    expect(init?.headers?.['X-Api-Resource-Id']).toBe('seed-tts-2.0');
    expect(JSON.parse(init?.body ?? '{}')).toMatchObject({
      req_params: { speaker: 'zh_female_vv_uranus_bigtts' },
    });
  });

  it('rejects unsupported ASR local audio extensions before upload', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'volcengine-asr-'));
    const audioPath = join(dir, 'audio.txt');
    writeFileSync(audioPath, Buffer.from('audio'));

    await expect(new VolcengineModelClient(credentials()).asr(audioPath)).rejects.toThrow(AppError);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });
});
