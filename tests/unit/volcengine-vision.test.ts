import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetch } from 'undici';

import { VolcengineModelClient } from '../../src/main/model-client/volcengine.js';

vi.mock('undici', () => ({
  fetch: vi.fn(),
}));

describe('VolcengineModelClient.visionVideo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends the source video as multimodal chat content', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'volcengine-vision-'));
    const videoPath = join(dir, 'source.mp4');
    writeFileSync(videoPath, Buffer.from('video'));

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          choices: [{ message: { content: '{"scenes":[]}' } }],
        }),
    } as never);

    const client = new VolcengineModelClient({
      llmApiKey: 'llm-key',
      provider: {
        seedanceBaseUrl: 'https://ark.invalid',
        seedanceModel: 'seedance',
        imageBaseUrl: 'https://ark.invalid',
        imageModel: 'seedream',
        llmBaseUrl: 'https://ark.invalid',
        llmModel: 'doubao-vision',
        ttsBaseUrl: 'https://speech.invalid',
        ttsVoice: 'voice',
        asrBaseUrl: 'https://openspeech.invalid',
        asrResourceId: 'volc.seedasr.auc',
        ossEndpoint: '',
        ossBucketName: '',
      },
    });

    await expect(client.visionVideo(videoPath, '拆解视频分镜')).resolves.toBe('{"scenes":[]}');

    const call = vi.mocked(fetch).mock.calls[0];
    expect(call?.[0]).toBe('https://ark.invalid/chat/completions');
    const init = call?.[1] as { headers?: Record<string, string>; body?: string } | undefined;
    expect(init?.headers?.Authorization).toBe('Bearer llm-key');
    const body = JSON.parse(init?.body ?? '{}') as {
      messages?: Array<{ content?: Array<{ type?: string; video_url?: { url?: string }; text?: string }> }>;
    };
    const content = body.messages?.[0]?.content ?? [];
    expect(content[0]?.type).toBe('video_url');
    expect(content[0]?.video_url?.url).toContain('data:video/mp4;base64,');
    expect(content[1]).toMatchObject({ type: 'text', text: '拆解视频分镜' });
  });
});
