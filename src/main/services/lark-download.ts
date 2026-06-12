import { BrowserWindow } from 'electron';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import pRetry from 'p-retry';
import { fetch } from 'undici';

import { AppError } from '../errors.js';
import {
  buildCookieHeader,
  chooseBestTranscode,
  isRetryableDownloadError,
  isUnauthorizedStatus,
  parseClientVarsResponses,
  parseFileInfoRequestBodies,
  parseLarkDocumentUrl,
  sanitizeFileName,
  mergeVideoEntries,
  type LarkVideoEntry,
} from './lark-download-helpers.js';
import type { LarkDownloadInput, LarkDownloadSummary } from '../../shared/types.js';

const DOWNLOAD_TIMEOUT_MS = 240_000;
const FILE_INFO_TIMEOUT_MS = 60_000;
const PAGE_SETTLE_MS = 5_000;
const LOGIN_REQUIRED_HINT = '飞书登录态可能已失效，请重新登录飞书后重试。';

interface DownloadLarkVideosParams {
  input: LarkDownloadInput;
  artifactDir: string;
  onProgress?: (message: string, completed: number, total: number) => void;
}

interface FileInfoMeta {
  dataVersion: string;
  name: string;
  mimeType?: string;
  type?: string;
}

interface VideoMetaResult {
  meta: FileInfoMeta;
  transcode: {
    quality: string;
    url: string;
  };
}

interface DownloadVideoResult {
  path: string;
  size: number;
  skipped: boolean;
}

function createHiddenWindow(): BrowserWindow {
  return new BrowserWindow({
    show: false,
    width: 1280,
    height: 800,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      backgroundThrottling: false,
    },
  });
}

async function withRetry<T>(task: () => Promise<T>): Promise<T> {
  return pRetry(task, {
    retries: 2,
    factor: 2,
    minTimeout: 1000,
    shouldRetry: (error) => isRetryableDownloadError(error),
  });
}

async function wait(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

interface LoadedDocumentData {
  clientVarsSnippets: string[];
  fileInfoRequestBodies: string[];
}

async function loadDocument(window: BrowserWindow, url: string): Promise<LoadedDocumentData> {
  await window.loadURL(url);
  await wait(PAGE_SETTLE_MS);
  const result = await window.webContents.executeJavaScript(
    `
      (async () => {
        const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        const capture = window.__tr_lark_video_capture ?? {
          installed: false,
          fileInfoRequestBodies: [],
        };
        if (!capture.installed) {
          capture.installed = true;
          const pushBody = (body) => {
            if (typeof body !== 'string' || body.length === 0) {
              return;
            }
            if (!body.includes('"file_token"') || !body.includes('"mount_node_token"')) {
              return;
            }
            if (!capture.fileInfoRequestBodies.includes(body)) {
              capture.fileInfoRequestBodies.push(body);
            }
          };
          const originalFetch = window.fetch.bind(window);
          window.fetch = async (input, init) => {
            try {
              const targetUrl =
                typeof input === 'string'
                  ? input
                  : input instanceof Request
                    ? input.url
                    : String(input ?? '');
              if (/\\/space\\/api\\/box\\/file\\/info\\//.test(targetUrl)) {
                const body = init?.body;
                if (typeof body === 'string') {
                  pushBody(body);
                }
              }
            } catch {
              // Ignore capture failures and preserve the original request flow.
            }
            return originalFetch(input, init);
          };

          const originalOpen = XMLHttpRequest.prototype.open;
          const originalSend = XMLHttpRequest.prototype.send;
          XMLHttpRequest.prototype.open = function (...args) {
            this.__tr_lark_request_url = typeof args[1] === 'string' ? args[1] : '';
            return originalOpen.apply(this, args);
          };
          XMLHttpRequest.prototype.send = function (body) {
            try {
              if (
                typeof this.__tr_lark_request_url === 'string' &&
                /\\/space\\/api\\/box\\/file\\/info\\//.test(this.__tr_lark_request_url) &&
                typeof body === 'string'
              ) {
                pushBody(body);
              }
            } catch {
              // Ignore capture failures and preserve the original request flow.
            }
            return originalSend.call(this, body);
          };
          window.__tr_lark_video_capture = capture;
        }

        for (let index = 0; index < 4; index += 1) {
          window.scrollTo(0, document.body.scrollHeight);
          await delay(1000);
        }
        await delay(1200);
        const urls = [...new Set(
          performance
            .getEntriesByType('resource')
            .map((entry) => entry.name)
            .filter((name) => /space\\/api\\/docx\\/pages\\/client_vars/.test(name))
        )];
        const responses = [];
        for (const resourceUrl of urls) {
          try {
            const response = await fetch(resourceUrl, { credentials: 'include' });
            const contentType = response.headers.get('content-type') ?? '';
            if (response.ok && /json/i.test(contentType)) {
              responses.push(await response.text());
            }
          } catch {
            // Ignore individual client_vars fetch failures and keep the rest.
          }
        }
        return {
          clientVarsSnippets: responses,
          fileInfoRequestBodies: Array.isArray(capture.fileInfoRequestBodies)
            ? capture.fileInfoRequestBodies.filter((item) => typeof item === 'string')
            : [],
        };
      })();
    `,
    true,
  );
  if (!result || typeof result !== 'object') {
    return {
      clientVarsSnippets: [],
      fileInfoRequestBodies: [],
    };
  }

  const data = result as {
    clientVarsSnippets?: unknown;
    fileInfoRequestBodies?: unknown;
  };
  return {
    clientVarsSnippets: Array.isArray(data.clientVarsSnippets)
      ? data.clientVarsSnippets.filter((item): item is string => typeof item === 'string')
      : [],
    fileInfoRequestBodies: Array.isArray(data.fileInfoRequestBodies)
      ? data.fileInfoRequestBodies.filter((item): item is string => typeof item === 'string')
      : [],
  };
}

async function fetchVideoMeta(params: {
  documentUrl: string;
  documentToken: string;
  hostType: 'Wiki' | 'Docx';
  cookieHeader: string;
  csrfToken: string;
  entry: LarkVideoEntry;
}): Promise<VideoMetaResult> {
  return withRetry(async () => {
    const response = await fetch(new URL('/space/api/box/file/info/', params.documentUrl), {
      method: 'POST',
      headers: {
        accept: 'application/json, text/plain, */*',
        'content-type': 'application/json',
        cookie: params.cookieHeader,
        referer: params.documentUrl,
        'x-csrftoken': params.csrfToken,
        'docs-host-id': params.documentToken,
        'docs-host-type': params.hostType,
        'doc-platform': 'desktop',
        'doc-os': process.platform === 'darwin' ? 'mac' : process.platform,
        'doc-biz': 'Lark',
      },
      body: JSON.stringify({
        file_token: params.entry.fileToken,
        mount_point: 'docx_file',
        mount_node_token: params.entry.mountNodeToken,
        option_params: ['preview_meta', 'check_cipher'],
      }),
      signal: AbortSignal.timeout(FILE_INFO_TIMEOUT_MS),
    });

    if (isUnauthorizedStatus(response.status)) {
      throw new AppError('E_DOWNLOAD_FAILED', LOGIN_REQUIRED_HINT);
    }
    if (!response.ok) {
      throw new Error(`file/info HTTP ${response.status}`);
    }

    const json = (await response.json()) as {
      code?: number;
      data?: {
        data_version?: string;
        name?: string;
        mime_type?: string;
        type?: string;
        preview_meta?: {
          data?: Record<string, { content?: { transcode_urls?: Record<string, unknown> } }>;
        };
      };
    };
    const dataVersion = json.data?.data_version;
    const transcodeUrls = json.data?.preview_meta?.data?.['3']?.content?.transcode_urls;
    const transcode = chooseBestTranscode(transcodeUrls);
    if (json.code !== 0 || !dataVersion || !transcode) {
      throw new Error(`file/info unavailable: code=${json.code ?? 'unknown'}`);
    }

    return {
      meta: {
        dataVersion,
        name:
          typeof json.data?.name === 'string' && json.data.name.trim().length > 0
            ? json.data.name
            : `${params.entry.fileToken}.mp4`,
        ...(typeof json.data?.mime_type === 'string' ? { mimeType: json.data.mime_type } : {}),
        ...(typeof json.data?.type === 'string' ? { type: json.data.type } : {}),
      },
      transcode,
    };
  });
}

async function downloadVideo(params: {
  streamUrl: string;
  documentUrl: string;
  cookieHeader: string;
  outputPath: string;
}): Promise<DownloadVideoResult> {
  try {
    const existing = await stat(params.outputPath);
    if (existing.size > 0) {
      return { path: params.outputPath, size: existing.size, skipped: true };
    }
  } catch {
    // File does not exist yet.
  }

  return withRetry(async () => {
    const response = await fetch(params.streamUrl, {
      headers: {
        cookie: params.cookieHeader,
        referer: params.documentUrl,
        range: 'bytes=0-',
        'accept-encoding': 'identity;q=1, *;q=0',
      },
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    });
    if (isUnauthorizedStatus(response.status)) {
      throw new AppError('E_DOWNLOAD_FAILED', LOGIN_REQUIRED_HINT);
    }
    if (!response.ok) {
      throw new Error(`stream HTTP ${response.status}`);
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length === 0) {
      throw new Error('empty response body');
    }

    await writeFile(params.outputPath, bytes);
    const file = await stat(params.outputPath);
    if (file.size <= 0) {
      throw new Error('downloaded file is empty');
    }
    return { path: params.outputPath, size: file.size, skipped: false };
  });
}

function createBaseSummary(params: {
  documentUrl: string;
  documentType: 'wiki' | 'docx';
  documentToken: string;
  outputDir: string;
}): LarkDownloadSummary {
  return {
    sourceUrl: params.documentUrl,
    sourceType: params.documentType,
    sourceToken: params.documentToken,
    outputDir: params.outputDir,
    discovered: 0,
    successCount: 0,
    failureCount: 0,
    loginRequired: false,
    successes: [],
    failures: [],
  };
}

export async function downloadLarkVideos(params: DownloadLarkVideosParams): Promise<{
  summary: LarkDownloadSummary;
  summaryPath: string;
}> {
  const parsed = parseLarkDocumentUrl(params.input.url);
  const outputRoot = params.input.outputDir ?? join(params.artifactDir, 'downloads');
  const outputDir = join(outputRoot, parsed.token);
  await mkdir(outputDir, { recursive: true });
  const summary = createBaseSummary({
    documentUrl: parsed.normalizedUrl,
    documentType: parsed.type,
    documentToken: parsed.token,
    outputDir,
  });
  const summaryPath = join(outputDir, 'download-summary.json');

  const window = createHiddenWindow();
  try {
    params.onProgress?.('正在打开飞书页面并发现视频块', 0, 0);
    const documentData = await loadDocument(window, parsed.normalizedUrl);
    const entries = mergeVideoEntries(
      parseClientVarsResponses(documentData.clientVarsSnippets),
      parseFileInfoRequestBodies(documentData.fileInfoRequestBodies),
    );
    summary.discovered = entries.length;

    const cookies = await window.webContents.session.cookies.get({ url: parsed.normalizedUrl });
    const csrfToken = cookies.find((cookie) => cookie.name === '_csrf_token')?.value;
    const cookieHeader = buildCookieHeader(
      cookies.map((cookie) => ({
        name: cookie.name,
        value: cookie.value,
      })),
    );

    if (!csrfToken || cookieHeader.length === 0) {
      summary.loginRequired = true;
      summary.loginHint = LOGIN_REQUIRED_HINT;
      await writeFile(summaryPath, JSON.stringify(summary, null, 2), 'utf8');
      throw new AppError('E_DOWNLOAD_FAILED', LOGIN_REQUIRED_HINT);
    }

    if (entries.length === 0) {
      const firstFailure =
        '未在页面中发现视频块。当前已尝试 client_vars 与 box/file/info 两种发现方式，请确认链接可访问且页面内包含视频内容。';
      summary.failures.push({
        fileToken: '',
        mountNodeToken: '',
        name: 'document',
        reason: firstFailure,
      });
      summary.failureCount = summary.failures.length;
      await writeFile(summaryPath, JSON.stringify(summary, null, 2), 'utf8');
      throw new AppError('E_DOWNLOAD_FAILED', firstFailure);
    }

    for (const [index, entry] of entries.entries()) {
      params.onProgress?.(
        `正在下载 ${entry.name} (${index + 1}/${entries.length})`,
        index,
        entries.length,
      );
      try {
        const { meta, transcode } = await fetchVideoMeta({
          documentUrl: parsed.normalizedUrl,
          documentToken: parsed.token,
          hostType: parsed.hostType,
          cookieHeader,
          csrfToken,
          entry,
        });
        const streamUrl = `${transcode.url}&data_version=${encodeURIComponent(meta.dataVersion)}&mount_point=docx_file`;
        const outputPath = join(outputDir, sanitizeFileName(meta.name, `${entry.fileToken}.mp4`));
        const downloaded = await downloadVideo({
          streamUrl,
          documentUrl: parsed.normalizedUrl,
          cookieHeader,
          outputPath,
        });
        summary.successes.push({
          fileToken: entry.fileToken,
          mountNodeToken: entry.mountNodeToken,
          name: meta.name,
          path: downloaded.path,
          size: downloaded.size,
          ...(meta.mimeType !== undefined ? { mimeType: meta.mimeType } : {}),
          ...(meta.type !== undefined ? { fileType: meta.type } : {}),
          quality: transcode.quality,
          skipped: downloaded.skipped,
        });
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        if (reason.includes(LOGIN_REQUIRED_HINT)) {
          summary.loginRequired = true;
          summary.loginHint = LOGIN_REQUIRED_HINT;
        }
        summary.failures.push({
          fileToken: entry.fileToken,
          mountNodeToken: entry.mountNodeToken,
          name: entry.name,
          reason,
        });
      }
      summary.successCount = summary.successes.length;
      summary.failureCount = summary.failures.length;
      await writeFile(summaryPath, JSON.stringify(summary, null, 2), 'utf8');
    }

    params.onProgress?.('飞书视频下载完成，正在写入汇总结果', entries.length, entries.length);
    if (summary.successCount === 0) {
      const detail = summary.loginHint ?? summary.failures[0]?.reason ?? '未下载到任何视频文件';
      throw new AppError('E_DOWNLOAD_FAILED', detail);
    }

    return { summary, summaryPath };
  } finally {
    if (!window.isDestroyed()) {
      window.destroy();
    }
  }
}
