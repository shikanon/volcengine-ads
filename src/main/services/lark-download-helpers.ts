import { basename } from 'node:path';

import { AppError } from '../errors.js';
import type { LarkDocumentType } from '../../shared/types.js';

const SUPPORTED_LARK_HOSTS = [/\.larkoffice\.com$/iu, /\.feishu\.cn$/iu];

export interface ParsedLarkDocumentUrl {
  type: LarkDocumentType;
  token: string;
  normalizedUrl: string;
  host: string;
  hostType: 'Wiki' | 'Docx';
}

export interface LarkVideoEntry {
  fileToken: string;
  mountNodeToken: string;
  name: string;
}

export interface LarkTranscodeChoice {
  quality: string;
  url: string;
}

interface LarkFileBlock {
  token?: unknown;
  name?: unknown;
  mimeType?: unknown;
}

interface LarkBlockRecord {
  data?: {
    file?: LarkFileBlock;
  };
}

function isSupportedLarkHost(host: string): boolean {
  return SUPPORTED_LARK_HOSTS.some((pattern) => pattern.test(host));
}

function normalizeUrl(rawUrl: string): URL {
  try {
    return new URL(rawUrl.trim());
  } catch (error) {
    throw new AppError('E_INPUT_VALIDATION', '飞书链接格式错误', { cause: error });
  }
}

export function parseLarkDocumentUrl(rawUrl: string): ParsedLarkDocumentUrl {
  const url = normalizeUrl(rawUrl);
  if (!isSupportedLarkHost(url.host)) {
    throw new AppError('E_INPUT_VALIDATION', '仅支持飞书 wiki/docx 链接');
  }

  const segments = url.pathname.split('/').filter(Boolean);
  const type = segments[0];
  const token = segments[1];
  if ((type !== 'wiki' && type !== 'docx') || !token) {
    throw new AppError('E_INPUT_VALIDATION', '仅支持飞书 wiki/docx 链接');
  }

  return {
    type,
    token,
    normalizedUrl: `${url.origin}/${type}/${token}`,
    host: url.host,
    hostType: type === 'wiki' ? 'Wiki' : 'Docx',
  };
}

export function sanitizeFileName(name: string, fallback: string): string {
  const trimmed = name.trim().length > 0 ? name.trim() : fallback;
  return trimmed
    .replace(/[<>:"/\\|?*]/gu, '_')
    .split('')
    .map((char) => (char.charCodeAt(0) < 32 ? '_' : char))
    .join('');
}

function qualityScore(name: string): number {
  const normalized = name.toLowerCase();
  if (normalized === 'origin' || normalized === 'original' || normalized === 'source') {
    return 10000;
  }
  const match = normalized.match(/(\d{3,4})p/iu);
  if (match?.[1]) {
    return Number(match[1]);
  }
  if (normalized.includes('uhd')) return 2160;
  if (normalized.includes('fhd')) return 1080;
  if (normalized.includes('hd')) return 720;
  if (normalized.includes('sd')) return 480;
  return 1;
}

export function chooseBestTranscode(transcodeUrls: Record<string, unknown> | undefined): LarkTranscodeChoice | undefined {
  if (!transcodeUrls) {
    return undefined;
  }
  const entries = Object.entries(transcodeUrls)
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].length > 0)
    .sort((left, right) => qualityScore(right[0]) - qualityScore(left[0]));
  const [quality, url] = entries[0] ?? [];
  return quality && url ? { quality, url } : undefined;
}

export function isRetryableDownloadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /(ECONNRESET|ETIMEDOUT|Timeout|timed out|EAI_AGAIN|ENOTFOUND|socket hang up|HTTP 5\d\d|empty response body)/iu.test(
    message,
  );
}

export function isUnauthorizedStatus(status: number): boolean {
  return status === 401 || status === 403;
}

export function buildCookieHeader(cookies: Array<{ name: string; value: string }>): string {
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
}

export function parseClientVarsResponses(snippets: string[]): LarkVideoEntry[] {
  const videos = new Map<string, LarkVideoEntry>();

  for (const snippet of snippets) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(snippet) as unknown;
    } catch {
      continue;
    }

    const blockMap = (
      parsed as {
        data?: {
          block_map?: Record<string, LarkBlockRecord>;
        };
      }
    ).data?.block_map;
    if (!blockMap) {
      continue;
    }

    for (const [blockId, block] of Object.entries(blockMap)) {
      const file = block.data?.file;
      if (!file || file.mimeType !== 'video/mp4' || typeof file.token !== 'string') {
        continue;
      }
      if (!videos.has(file.token)) {
        videos.set(file.token, {
          fileToken: file.token,
          mountNodeToken: blockId,
          name: typeof file.name === 'string' && file.name.trim().length > 0 ? file.name : `${file.token}.mp4`,
        });
      }
    }
  }

  return [...videos.values()];
}

export function parseFileInfoRequestBodies(snippets: string[]): LarkVideoEntry[] {
  const videos = new Map<string, LarkVideoEntry>();

  for (const snippet of snippets) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(snippet) as unknown;
    } catch {
      continue;
    }

    const fileToken =
      typeof (parsed as { file_token?: unknown }).file_token === 'string'
        ? (parsed as { file_token: string }).file_token
        : undefined;
    const mountNodeToken =
      typeof (parsed as { mount_node_token?: unknown }).mount_node_token === 'string'
        ? (parsed as { mount_node_token: string }).mount_node_token
        : undefined;
    if (!fileToken || !mountNodeToken) {
      continue;
    }

    if (!videos.has(fileToken)) {
      videos.set(fileToken, {
        fileToken,
        mountNodeToken,
        name: `${fileToken}.mp4`,
      });
    }
  }

  return [...videos.values()];
}

export function mergeVideoEntries(...groups: LarkVideoEntry[][]): LarkVideoEntry[] {
  const merged = new Map<string, LarkVideoEntry>();
  for (const group of groups) {
    for (const entry of group) {
      if (!merged.has(entry.fileToken)) {
        merged.set(entry.fileToken, entry);
      }
    }
  }
  return [...merged.values()];
}

export function resolveLarkDownloadDirectory(baseDir: string, sourceToken: string): string {
  return `${baseDir.replace(/[\\/]+$/u, '')}/${basename(sourceToken)}`;
}
