import { mkdtempSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetch } from 'undici';

import { downloadLarkVideos } from '../../src/main/services/lark-download.js';

const browserMocks = vi.hoisted(() => ({
  loadURL: vi.fn(),
  executeJavaScript: vi.fn(),
  getCookies: vi.fn(),
  destroy: vi.fn(),
}));

vi.mock('electron', () => ({
  BrowserWindow: vi.fn().mockImplementation(() => ({
    loadURL: browserMocks.loadURL,
    webContents: {
      executeJavaScript: browserMocks.executeJavaScript,
      session: {
        cookies: {
          get: browserMocks.getCookies,
        },
      },
    },
    isDestroyed: () => false,
    destroy: browserMocks.destroy,
  })),
}));

vi.mock('undici', () => ({
  fetch: vi.fn(),
}));

function toArrayBuffer(content: string): ArrayBuffer {
  const bytes = Buffer.from(content, 'utf8');
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

describe('downloadLarkVideos', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    browserMocks.loadURL.mockResolvedValue(undefined);
    browserMocks.executeJavaScript.mockResolvedValue([
      JSON.stringify({
        data: {
          block_map: {
            blockA: {
              data: {
                file: {
                  token: 'file-a',
                  name: 'demo/video-a.mp4',
                  mimeType: 'video/mp4',
                },
              },
            },
            blockB: {
              data: {
                file: {
                  token: 'file-b',
                  name: 'video-b.mp4',
                  mimeType: 'video/mp4',
                },
              },
            },
          },
        },
      }),
    ]);
    browserMocks.getCookies.mockResolvedValue([
      { name: '_csrf_token', value: 'csrf-token' },
      { name: 'session', value: 'session-cookie' },
    ]);
    browserMocks.destroy.mockImplementation(() => undefined);
  });

  it(
    'downgrades to the best available transcode and persists the summary with mixed results',
    async () => {
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('/space/api/box/file/info/')) {
        const body = JSON.parse(String(init?.body)) as { file_token: string };
        if (body.file_token === 'file-a') {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              code: 0,
              data: {
                data_version: 'v1',
                name: 'demo/video-a.mp4',
                mime_type: 'video/mp4',
                type: 'video',
                preview_meta: {
                  data: {
                    '3': {
                      content: {
                        transcode_urls: {
                          '480p': 'https://cdn.example.com/video-a-480.mp4?from=480',
                          '720p': 'https://cdn.example.com/video-a-720.mp4?from=720',
                        },
                      },
                    },
                  },
                },
              },
            }),
          } as never;
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            code: 0,
            data: {
              data_version: 'v2',
              name: 'video-b.mp4',
              preview_meta: {
                data: {
                  '3': {
                    content: {
                      transcode_urls: {},
                    },
                  },
                },
              },
            },
          }),
        } as never;
      }

      if (url.startsWith('https://cdn.example.com/video-a-720.mp4')) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => toArrayBuffer('video-a'),
        } as never;
      }

      throw new Error(`unexpected fetch request: ${url}`);
    });

      const artifactDir = mkdtempSync(join(tmpdir(), 'lark-download-'));
      const { summary, summaryPath } = await downloadLarkVideos({
        input: {
          url: 'https://bytedance.larkoffice.com/docx/doc-token',
        },
        artifactDir,
      });

      expect(summary.discovered).toBe(2);
      expect(summary.successCount).toBe(1);
      expect(summary.failureCount).toBe(1);
      expect(summary.loginRequired).toBe(false);
      expect(summary.successes).toEqual([
        expect.objectContaining({
          fileToken: 'file-a',
          name: 'demo/video-a.mp4',
          quality: '720p',
          skipped: false,
        }),
      ]);
      expect(summary.failures).toEqual([
        expect.objectContaining({
          fileToken: 'file-b',
          reason: expect.stringContaining('file/info unavailable'),
        }),
      ]);
      expect(summary.successes[0]?.path).toBe(join(artifactDir, 'downloads', 'doc-token', 'demo_video-a.mp4'));
      await expect(readFile(summary.successes[0]?.path ?? '', 'utf8')).resolves.toBe('video-a');

      const persisted = JSON.parse(await readFile(summaryPath, 'utf8')) as typeof summary;
      expect(persisted).toMatchObject({
        discovered: 2,
        successCount: 1,
        failureCount: 1,
        outputDir: join(artifactDir, 'downloads', 'doc-token'),
      });
      expect(browserMocks.destroy).toHaveBeenCalledTimes(1);
    },
    10000,
  );
});
