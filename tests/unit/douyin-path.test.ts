import { mkdtempSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildYtDlpArgs,
  buildYtDlpCookieExportArgs,
  buildYtDlpCookieHeaderArgs,
  buildYtDlpCookieFileArgs,
  explainDouyinDownloadFailure,
  normalizeDouyinCookieHeader,
  normalizeDouyinUrlInput,
  resolveChromeCookieCacheFallbackPath,
  resolveChromeCookieCachePath,
  resolveBundledYtDlpPath,
  resolveManagedYtDlpPath,
  resolveYtDlpPath,
  resolveYtDlpReleaseAssetName,
  shouldRefreshChromeCookieCache,
  shouldRetryWithoutChromeCookies,
} from '../../src/main/media/douyin.js';
import type { DouyinCookieSource } from '../../src/shared/types.js';

const originalResourcesPath = process.resourcesPath;

describe('douyin yt-dlp path', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    Object.defineProperty(process, 'resourcesPath', {
      configurable: true,
      value: originalResourcesPath,
    });
  });

  it('maps platform and architecture to the expected release asset', () => {
    expect(resolveYtDlpReleaseAssetName('darwin', 'arm64')).toBe('yt-dlp_macos');
    expect(resolveYtDlpReleaseAssetName('linux', 'arm64')).toBe('yt-dlp_linux_aarch64');
    expect(resolveYtDlpReleaseAssetName('linux', 'x64')).toBe('yt-dlp_linux');
    expect(resolveYtDlpReleaseAssetName('win32', 'arm64')).toBe('yt-dlp_arm64.exe');
    expect(resolveYtDlpReleaseAssetName('win32', 'ia32')).toBe('yt-dlp_x86.exe');
    expect(resolveYtDlpReleaseAssetName('win32', 'x64')).toBe('yt-dlp.exe');
  });

  it('normalizes markdown-wrapped share links to a plain douyin url', () => {
    expect(normalizeDouyinUrlInput('`https://v.douyin.com/4nWmGRefBWQ/`')).toBe(
      'https://v.douyin.com/4nWmGRefBWQ/',
    );
    expect(
      normalizeDouyinUrlInput(
        '7.43 复制打开抖音，看看【示例】 https://v.douyin.com/4nWmGRefBWQ/ ，',
      ),
    ).toBe('https://v.douyin.com/4nWmGRefBWQ/');
  });

  it('converts douyin search modal links into canonical video urls', () => {
    expect(
      normalizeDouyinUrlInput(
        'https://www.douyin.com/jingxuan/search/%E7%81%AF%E9%A5%B0?aid=8483d103-7222-4b30-b2d0-e5c55b3d6aae&modal_id=6845191409901817091&type=general',
      ),
    ).toBe('https://www.douyin.com/video/6845191409901817091');
  });

  it('maps fresh-cookies failures to an actionable detail message', () => {
    expect(
      explainDouyinDownloadFailure(
        new Error(
          'ERROR: [Douyin] 7647393544173158821: Fresh cookies (not necessarily logged in) are needed',
        ),
      ),
    ).toContain('抖音要求提供最新登录态');
    expect(
      explainDouyinDownloadFailure(
        new Error('WARNING: [Douyin] Failed to parse JSON\nDownloading web detail JSON'),
      ),
    ).toContain('详情页解析失败');
  });

  it('maps chrome-cookie bootstrap failures to a dedicated guidance message', () => {
    expect(
      explainDouyinDownloadFailure(new Error('could not find chrome cookies database')),
    ).toContain('无法从本机 Chrome 读取登录态');
    expect(
      explainDouyinDownloadFailure(new Error('failed to decrypt chrome cookie store')),
    ).toContain('无法从本机 Chrome 读取登录态');
    expect(
      explainDouyinDownloadFailure(new Error('cannot decrypt chrome keyring')),
    ).toContain('无法从本机 Chrome 读取登录态');
  });

  it('exposes cookie source values covering all four states', () => {
    const sources: DouyinCookieSource[] = [
      'manual_header',
      'chrome_browser',
      'chrome_browser_cached',
      'none',
    ];
    expect(sources).toHaveLength(4);
  });

  it('builds yt-dlp args with chrome cookies enabled by default', () => {
    expect(buildYtDlpArgs('/tmp/source.mp4', 'https://v.douyin.com/abc/', true)).toEqual([
      '--cookies-from-browser',
      'chrome',
      '-o',
      '/tmp/source.mp4',
      '--no-playlist',
      'https://v.douyin.com/abc/',
    ]);
    expect(buildYtDlpArgs('/tmp/source.mp4', 'https://v.douyin.com/abc/', false)).toEqual([
      '-o',
      '/tmp/source.mp4',
      '--no-playlist',
      'https://v.douyin.com/abc/',
    ]);
  });

  it('retries without chrome cookies only for browser-cookie bootstrap failures', () => {
    expect(
      shouldRetryWithoutChromeCookies(new Error('could not find chrome cookies database')),
    ).toBe(true);
    expect(
      shouldRetryWithoutChromeCookies(new Error('failed to decrypt chrome cookie store')),
    ).toBe(true);
    expect(
      shouldRetryWithoutChromeCookies(
        new Error('Fresh cookies (not necessarily logged in) are needed'),
      ),
    ).toBe(false);
  });

  it('stores chrome cookies in a stable userData cache file', () => {
    expect(resolveChromeCookieCachePath('/tmp/volcengine-ads')).toBe(
      join('/tmp/volcengine-ads', 'cookies', 'yt-dlp-chrome-cookies.txt'),
    );
    expect(resolveChromeCookieCacheFallbackPath('/tmp/volcengine-ads')).toBe(
      join('/tmp/volcengine-ads', 'yt-dlp-cache', 'yt-dlp-chrome-cookies.txt'),
    );
  });

  it('builds yt-dlp args for cached cookie files and cookie export', () => {
    expect(
      buildYtDlpCookieFileArgs(
        '/tmp/source.mp4',
        'https://v.douyin.com/abc/',
        '/tmp/cookies/yt-dlp-chrome-cookies.txt',
      ),
    ).toEqual([
      '--cookies',
      '/tmp/cookies/yt-dlp-chrome-cookies.txt',
      '-o',
      '/tmp/source.mp4',
      '--no-playlist',
      'https://v.douyin.com/abc/',
    ]);
    expect(
      buildYtDlpCookieExportArgs(
        '/tmp/cookies/yt-dlp-chrome-cookies.txt',
        'https://v.douyin.com/abc/',
      ),
    ).toEqual([
      '--cookies-from-browser',
      'chrome',
      '--cookies',
      '/tmp/cookies/yt-dlp-chrome-cookies.txt',
      '--skip-download',
      '--simulate',
      '--no-playlist',
      'https://v.douyin.com/abc/',
    ]);
    expect(
      buildYtDlpCookieHeaderArgs(
        '/tmp/source.mp4',
        'https://v.douyin.com/abc/',
        'Cookie: sessionid=abc; ttwid=def',
      ),
    ).toEqual([
      '--add-header',
      'Cookie: sessionid=abc; ttwid=def',
      '-o',
      '/tmp/source.mp4',
      '--no-playlist',
      'https://v.douyin.com/abc/',
    ]);
  });

  it('normalizes configured cookie headers copied from chrome devtools', () => {
    expect(
      normalizeDouyinCookieHeader('Cookie: sessionid=abc;\n  ttwid=def; passport_csrf_token=ghi'),
    ).toBe('sessionid=abc; ttwid=def; passport_csrf_token=ghi');
  });

  it('refreshes the cached cookie file only for auth-like failures', () => {
    expect(
      shouldRefreshChromeCookieCache(
        new Error('Fresh cookies (not necessarily logged in) are needed'),
      ),
    ).toBe(true);
    expect(
      shouldRefreshChromeCookieCache(
        new Error('WARNING: [Douyin] Failed to parse JSON\nDownloading web detail JSON'),
      ),
    ).toBe(true);
    expect(shouldRefreshChromeCookieCache(new Error('network timeout'))).toBe(false);
  });

  it('prefers the bundled yt-dlp binary when present', async () => {
    const resourcesPath = mkdtempSync(join(tmpdir(), 'yt-dlp-resources-'));
    const artifactDir = join(mkdtempSync(join(tmpdir(), 'yt-dlp-artifacts-')), 'artifacts', 'task-1');
    const bundledPath = resolveBundledYtDlpPath(resourcesPath);

    await mkdir(join(resourcesPath, 'bin'), { recursive: true });
    await writeFile(bundledPath, 'bundled', 'utf8');
    Object.defineProperty(process, 'resourcesPath', {
      configurable: true,
      value: resourcesPath,
    });

    await expect(resolveYtDlpPath(artifactDir)).resolves.toBe(bundledPath);
  });

  it('falls back to the project resources directory when process.resourcesPath is unavailable', () => {
    expect(resolveBundledYtDlpPath(undefined, 'darwin')).toBe(
      join(process.cwd(), 'resources', 'bin', 'yt-dlp'),
    );
  });

  it('downloads yt-dlp into userData when the packaged binary is missing', async () => {
    const resourcesPath = mkdtempSync(join(tmpdir(), 'yt-dlp-resources-'));
    const userDataDir = mkdtempSync(join(tmpdir(), 'yt-dlp-user-data-'));
    const artifactDir = join(userDataDir, 'artifacts', 'task-1');
    const managedPath = resolveManagedYtDlpPath(userDataDir);

    Object.defineProperty(process, 'resourcesPath', {
      configurable: true,
      value: resourcesPath,
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('downloaded-binary', { status: 200 })),
    );

    await expect(resolveYtDlpPath(artifactDir)).resolves.toBe(managedPath);
    await expect(readFile(managedPath, 'utf8')).resolves.toBe('downloaded-binary');
  });
});
