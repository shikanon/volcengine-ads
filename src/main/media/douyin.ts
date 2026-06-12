import { constants } from 'node:fs';
import { access } from 'node:fs/promises';
import { chmod } from 'node:fs/promises';
import { mkdir } from 'node:fs/promises';
import { rename } from 'node:fs/promises';
import { rm } from 'node:fs/promises';
import { stat } from 'node:fs/promises';
import { unlink } from 'node:fs/promises';
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { execa } from 'execa';

import { AppError } from '../errors.js';
import { extractAudio } from './ffmpeg.js';

export interface DouyinDownloadResult {
  sourceVideoPath: string;
  sourceAudioPath: string;
  metaPath: string;
}

const YT_DLP_RELEASE_BASE_URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download';
const YT_DLP_COOKIE_CACHE_NAME = 'yt-dlp-chrome-cookies.txt';
const YT_DLP_COOKIE_CACHE_FALLBACK_DIR = 'yt-dlp-cache';
const URL_PATTERN = /https?:\/\/[^\s"'`<>]+/u;
const URL_PREFIX_NOISE = new Set(['`', '"', "'", '“', '”', '‘', '’', '<', '《', '（', '(', '【', '[']);
const URL_SUFFIX_NOISE = new Set([
  '`',
  '"',
  "'",
  '“',
  '”',
  '‘',
  '’',
  '>',
  '》',
  '）',
  ')',
  '】',
  ']',
  '，',
  '。',
  '！',
  '？',
  '；',
  ';',
]);

function binaryFileName(platform: typeof process.platform): string {
  return platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
}

export function resolveBundledYtDlpPath(
  resourcesPath: string | undefined,
  platform: typeof process.platform = process.platform,
): string {
  const baseDir = resourcesPath ?? join(process.cwd(), 'resources');
  return join(baseDir, 'bin', binaryFileName(platform));
}

export function resolveManagedYtDlpPath(
  userDataDir: string,
  platform: typeof process.platform = process.platform,
): string {
  return join(userDataDir, 'bin', binaryFileName(platform));
}

export function resolveYtDlpReleaseAssetName(
  platform: typeof process.platform = process.platform,
  arch: typeof process.arch = process.arch,
): string | undefined {
  if (platform === 'darwin') {
    return 'yt-dlp_macos';
  }

  if (platform === 'win32') {
    if (arch === 'arm64') {
      return 'yt-dlp_arm64.exe';
    }
    if (arch === 'ia32') {
      return 'yt-dlp_x86.exe';
    }
    return 'yt-dlp.exe';
  }

  if (platform === 'linux') {
    return arch === 'arm64' ? 'yt-dlp_linux_aarch64' : 'yt-dlp_linux';
  }

  return undefined;
}

export function normalizeDouyinUrlInput(input: string): string {
  const trimmed = input.trim();
  const matchedUrl = trimmed.match(URL_PATTERN)?.[0] ?? trimmed;
  let normalized = matchedUrl.trim();

  while (normalized.length > 0 && URL_PREFIX_NOISE.has(normalized[0] ?? '')) {
    normalized = normalized.slice(1);
  }

  while (
    normalized.length > 0 &&
    URL_SUFFIX_NOISE.has(normalized[normalized.length - 1] ?? '')
  ) {
    normalized = normalized.slice(0, -1);
  }

  return normalized;
}

export function explainDouyinDownloadFailure(error: unknown): string | undefined {
  const message = error instanceof Error ? error.message : String(error);

  if (/Fresh cookies .* needed|cookies-from-browser|Sign in to confirm|login required/iu.test(message)) {
    return '抖音当前要求 fresh cookies，匿名下载被拦截。请重试公开可访问链接，或补充浏览器 cookies 能力后再试';
  }

  if (/Unable to handle request|Unsupported URL|Extracting URL:\s*$|Invalid URL/iu.test(message)) {
    return '未识别到有效抖音链接，请直接粘贴完整链接、短链或分享文案中的真实网址';
  }

  if (/Failed to parse JSON|Downloading web detail JSON|web detail JSON/iu.test(message)) {
    return '抖音详情页解析失败，通常是链接带了多余字符，或平台已要求 fresh cookies';
  }

  if (/403|429|timed out|ENOTFOUND|ECONNRESET|ECONNREFUSED|network/iu.test(message)) {
    return '抖音下载请求失败，请检查网络连接后重试';
  }

  return undefined;
}

export function buildYtDlpArgs(outputPath: string, url: string, useChromeCookies: boolean): string[] {
  return [
    ...(useChromeCookies ? ['--cookies-from-browser', 'chrome'] : []),
    '-o',
    outputPath,
    '--no-playlist',
    url,
  ];
}

export function buildYtDlpCookieFileArgs(
  outputPath: string,
  url: string,
  cookieFilePath: string,
): string[] {
  return ['--cookies', cookieFilePath, '-o', outputPath, '--no-playlist', url];
}

export function buildYtDlpCookieExportArgs(cookieFilePath: string, url: string): string[] {
  return [
    '--cookies-from-browser',
    'chrome',
    '--cookies',
    cookieFilePath,
    '--skip-download',
    '--simulate',
    '--no-playlist',
    url,
  ];
}

export function shouldRetryWithoutChromeCookies(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /cookies-from-browser|could not find chrome|could not locate chrome|browser cookie|keyring|secretstorage|cannot decrypt|failed to decrypt|chrome.*not installed/iu.test(
    message,
  );
}

export function shouldRefreshChromeCookieCache(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /Fresh cookies .* needed|Sign in to confirm|login required|Failed to parse JSON|Downloading web detail JSON|web detail JSON/iu.test(
    message,
  );
}

function userDataDirFromArtifactDir(artifactDir: string): string {
  return dirname(dirname(artifactDir));
}

export function resolveChromeCookieCachePath(userDataDir: string): string {
  return join(userDataDir, 'cookies', YT_DLP_COOKIE_CACHE_NAME);
}

export function resolveChromeCookieCacheFallbackPath(userDataDir: string): string {
  return join(userDataDir, YT_DLP_COOKIE_CACHE_FALLBACK_DIR, YT_DLP_COOKIE_CACHE_NAME);
}

function isDirectoryConflict(error: unknown): error is Error & { code?: string } {
  return error instanceof Error && 'code' in error && error.code === 'EEXIST';
}

async function ensureParentDirectory(filePath: string): Promise<void> {
  const parentDir = dirname(filePath);
  try {
    await mkdir(parentDir, { recursive: true });
  } catch (error) {
    if (!isDirectoryConflict(error)) {
      throw error;
    }

    const parentStat = await stat(parentDir).catch(() => undefined);
    if (parentStat?.isDirectory()) {
      return;
    }
    throw error;
  }
}

async function resolveUsableChromeCookieCachePath(userDataDir: string): Promise<string> {
  const primaryPath = resolveChromeCookieCachePath(userDataDir);
  try {
    await ensureParentDirectory(primaryPath);
    return primaryPath;
  } catch (error) {
    if (!isDirectoryConflict(error)) {
      throw error;
    }

    const fallbackPath = resolveChromeCookieCacheFallbackPath(userDataDir);
    await ensureParentDirectory(fallbackPath);
    return fallbackPath;
  }
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function makeExecutableIfNeeded(filePath: string): Promise<void> {
  if (process.platform === 'win32') {
    return;
  }

  await chmod(filePath, 0o755);
}

async function downloadManagedYtDlpBinary(artifactDir: string): Promise<string> {
  const assetName = resolveYtDlpReleaseAssetName();
  if (assetName === undefined) {
    throw new AppError('E_DOWNLOAD_FAILED', '当前系统暂不支持自动安装抖音下载工具');
  }

  const targetPath = resolveManagedYtDlpPath(userDataDirFromArtifactDir(artifactDir));
  const tempPath = `${targetPath}.download`;
  await mkdir(dirname(targetPath), { recursive: true });

  try {
    const response = await globalThis.fetch(`${YT_DLP_RELEASE_BASE_URL}/${assetName}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    const body = await response.arrayBuffer();
    await writeFile(tempPath, Buffer.from(body));
    await makeExecutableIfNeeded(tempPath);
    await rename(tempPath, targetPath);
    return targetPath;
  } catch (error) {
    await unlink(tempPath).catch(() => undefined);
    throw new AppError('E_DOWNLOAD_FAILED', '自动下载抖音解析工具失败，请检查网络后重试', {
      cause: error,
    });
  }
}

export async function resolveYtDlpPath(artifactDir: string): Promise<string> {
  const bundledPath = resolveBundledYtDlpPath(process.resourcesPath);
  if (await pathExists(bundledPath)) {
    return bundledPath;
  }

  const managedPath = resolveManagedYtDlpPath(userDataDirFromArtifactDir(artifactDir));
  if (await pathExists(managedPath)) {
    await makeExecutableIfNeeded(managedPath);
    return managedPath;
  }

  return downloadManagedYtDlpBinary(artifactDir);
}

async function exportChromeCookiesToCache(
  ytDlpPath: string,
  artifactDir: string,
  url: string,
): Promise<string> {
  const cookieFilePath = await resolveUsableChromeCookieCachePath(userDataDirFromArtifactDir(artifactDir));
  await rm(cookieFilePath, { force: true });
  const result = await execa(ytDlpPath, buildYtDlpCookieExportArgs(cookieFilePath, url), {
    reject: false,
  });
  if (await pathExists(cookieFilePath)) {
    return cookieFilePath;
  }
  const reason =
    result.failed && result.exitCode !== 0
      ? `${result.stderr || result.stdout || 'Chrome cookies 导出失败'}`
      : 'Chrome cookies 导出失败';
  throw new Error(reason);
}

export async function downloadDouyinVideo(url: string, artifactDir: string): Promise<DouyinDownloadResult> {
  const sourceVideoPath = join(artifactDir, 'source.mp4');
  const sourceAudioPath = join(artifactDir, 'source.m4a');
  const metaPath = join(artifactDir, 'meta.json');
  const normalizedUrl = normalizeDouyinUrlInput(url);
  const ytDlpPath = await resolveYtDlpPath(artifactDir);
  const cookieFilePath = await resolveUsableChromeCookieCachePath(userDataDirFromArtifactDir(artifactDir));
  await mkdir(dirname(sourceVideoPath), { recursive: true });
  try {
    try {
      const usableCookieFile = (await pathExists(cookieFilePath))
        ? cookieFilePath
        : await exportChromeCookiesToCache(ytDlpPath, artifactDir, normalizedUrl);
      try {
        await execa(ytDlpPath, buildYtDlpCookieFileArgs(sourceVideoPath, normalizedUrl, usableCookieFile));
      } catch (error) {
        if (!shouldRefreshChromeCookieCache(error)) {
          throw error;
        }
        const refreshedCookieFile = await exportChromeCookiesToCache(ytDlpPath, artifactDir, normalizedUrl);
        await execa(
          ytDlpPath,
          buildYtDlpCookieFileArgs(sourceVideoPath, normalizedUrl, refreshedCookieFile),
        );
      }
    } catch (error) {
      if (!shouldRetryWithoutChromeCookies(error)) {
        throw error;
      }
      await execa(ytDlpPath, buildYtDlpArgs(sourceVideoPath, normalizedUrl, false));
    }
    await extractAudio(sourceVideoPath, sourceAudioPath);
    return { sourceVideoPath, sourceAudioPath, metaPath };
  } catch (error) {
    throw new AppError('E_DOWNLOAD_FAILED', explainDouyinDownloadFailure(error), { cause: error });
  }
}
