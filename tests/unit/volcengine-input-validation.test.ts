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

  it('rejects empty web search query before the network request', async () => {
    await expect(
      new VolcengineModelClient(credentials()).webSearch({ query: '  ' }),
    ).rejects.toThrow(AppError);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it('calls Ark Responses web_search and parses streaming output', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () =>
        [
          'event: response.output_text.delta',
          'data: {"type":"response.output_text.delta","delta":"{\\"summary\\":\\"热梗补充\\"}"}',
          '',
          'event: response.completed',
          'data: {"type":"response.completed","response":{"output":[{"type":"message","content":[{"type":"output_text","text":"ignored"}]}]},"url":"https://example.com/hot","title":"热点来源"}',
          '',
          'data: [DONE]',
        ].join('\n'),
    } as never);

    const result = await new VolcengineModelClient(credentials()).webSearch({
      query: '今天有什么热点新闻？',
      maxKeyword: 2,
    });

    expect(result.text).toBe('{"summary":"热梗补充"}');
    expect(result.citations).toEqual([
      expect.objectContaining({ title: '热点来源', url: 'https://example.com/hot' }),
    ]);
    const [url, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(url).toBe('https://ark.invalid/responses');
    const request = JSON.parse((init as { body?: string } | undefined)?.body ?? '{}') as {
      model?: string;
      stream?: boolean;
      tools?: Array<{ type?: string; max_keyword?: number }>;
    };
    expect(request).toMatchObject({
      model: 'doubao-seed-2-0-pro-260215',
      stream: true,
      tools: [{ type: 'web_search', max_keyword: 2 }],
    });
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
