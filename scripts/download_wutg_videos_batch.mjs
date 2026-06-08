import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const wikiToken = 'WutgwjNvxienAqkVmwfc1sMZnqe';
const wikiUrl = `https://bytedance.larkoffice.com/wiki/${wikiToken}`;
const outDir = path.join(os.homedir(), 'Downloads', 'lark-wiki-videos', wikiToken);
const maxAttempts = 3;

function safeFileName(name, fallback) {
  const trimmed = (name || fallback || 'unnamed.mp4').trim();
  return trimmed.replace(/[/:*?"<>|]/g, '_');
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function qualityScore(name) {
  if (!name) return 0;
  const normalized = String(name).toLowerCase();
  if (normalized === 'origin' || normalized === 'original' || normalized === 'source') return 10000;
  const match = normalized.match(/(\d{3,4})p/);
  if (match) return Number(match[1]);
  if (normalized.includes('uhd')) return 2160;
  if (normalized.includes('fhd')) return 1080;
  if (normalized.includes('hd')) return 720;
  if (normalized.includes('sd')) return 480;
  return 1;
}

function chooseBestTranscode(transcodeUrls) {
  const entries = Object.entries(transcodeUrls || {}).filter(([, url]) => typeof url === 'string' && url.length > 0);
  entries.sort((a, b) => qualityScore(b[0]) - qualityScore(a[0]));
  return entries[0] ? { quality: entries[0][0], url: entries[0][1] } : null;
}

function isRetryableError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return /(ECONNRESET|ETIMEDOUT|Timeout|timed out|EAI_AGAIN|ENOTFOUND|socket hang up|stream http 5\d\d|file\/info http 5\d\d)/i.test(
    message,
  );
}

async function retry(label, task) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await task(attempt);
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts || !isRetryableError(error)) {
        throw error;
      }
      console.error(`${label} retry ${attempt}/${maxAttempts} failed: ${error instanceof Error ? error.message : String(error)}`);
      await delay(attempt * 1000);
    }
  }
  throw lastError;
}

function parseClientVarsResponses(snippets) {
  const videos = new Map();

  for (const snippet of snippets) {
    let outer;
    try {
      outer = JSON.parse(snippet);
    } catch {
      continue;
    }

    const blockMap = outer?.data?.block_map || {};
    for (const [blockId, block] of Object.entries(blockMap)) {
      const file = block?.data?.file;
      if (!file || file.mimeType !== 'video/mp4' || !file.token) continue;
      if (!videos.has(file.token)) {
        videos.set(file.token, {
          fileToken: file.token,
          mountNodeToken: blockId,
          name: file.name || `${file.token}.mp4`,
          size: file.size || 0,
        });
      }
    }
  }

  return [...videos.values()];
}

async function getCsrf(context) {
  const cookies = await context.cookies();
  return cookies.find((cookie) => cookie.name === '_csrf_token' && cookie.domain.includes('larkoffice.com'))?.value;
}

async function collectVideoEntries(page) {
  const snippets = [];

  page.on('response', async (response) => {
    if (!/space\/api\/docx\/pages\/client_vars/.test(response.url())) return;
    const headers = response.headers();
    if (!/json/i.test(headers['content-type'] || '')) return;
    try {
      snippets.push(await response.text());
    } catch {
      // Ignore truncated/consumed responses and keep the rest.
    }
  });

  await page.goto(wikiUrl, { waitUntil: 'networkidle', timeout: 45000 });

  // Let lazy client_vars pagination settle after the first networkidle.
  await page.waitForTimeout(5000);
  return parseClientVarsResponses(snippets);
}

async function fetchVideoMeta(request, csrf, entry) {
  return retry(`file/info ${entry.fileToken}`, async () => {
    const response = await request.post('https://bytedance.larkoffice.com/space/api/box/file/info/', {
      headers: {
        accept: 'application/json, text/plain, */*',
        'content-type': 'application/json',
        referer: wikiUrl,
        'x-csrftoken': csrf,
        'docs-host-id': wikiToken,
        'docs-host-type': 'Wiki',
        'doc-platform': 'web',
        'doc-os': 'mac',
        'doc-biz': 'Lark',
      },
      data: {
        file_token: entry.fileToken,
        mount_point: 'docx_file',
        mount_node_token: entry.mountNodeToken,
        option_params: ['preview_meta', 'check_cipher'],
      },
      timeout: 60000,
    });

    if (!response.ok()) {
      throw new Error(`file/info http ${response.status()}`);
    }

    const json = await response.json();
    const meta = json?.data;
    const bestTranscode = chooseBestTranscode(meta?.preview_meta?.data?.['3']?.content?.transcode_urls);
    if (json?.code !== 0 || !bestTranscode) {
      throw new Error(`file/info unavailable: code=${json?.code ?? 'unknown'}`);
    }

    return { meta, bestTranscode };
  });
}

async function downloadVideo(request, entry, meta, bestTranscode) {
  const streamUrl = `${bestTranscode.url}&data_version=${encodeURIComponent(meta.data_version)}&mount_point=docx_file`;
  const outPath = path.join(outDir, safeFileName(meta.name, `${entry.fileToken}.mp4`));

  return retry(`stream ${entry.fileToken} ${bestTranscode.quality}`, async () => {
    const response = await request.get(streamUrl, {
      headers: {
        referer: 'https://bytedance.larkoffice.com/',
        range: 'bytes=0-',
        'accept-encoding': 'identity;q=1, *;q=0',
      },
      timeout: 240000,
    });

    if (!response.ok()) {
      throw new Error(`stream http ${response.status()}`);
    }

    const buffer = await response.body();
    if (!buffer.length) {
      throw new Error('empty response body');
    }

    await fs.writeFile(outPath, buffer);
    const stat = await fs.stat(outPath);
    return {
      outPath,
      size: stat.size,
      mime: meta.mime_type,
      type: meta.type,
      quality: bestTranscode.quality,
      skipped: false,
    };
  });
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();

try {
  await fs.mkdir(outDir, { recursive: true });

  const entries = await collectVideoEntries(page);
  const csrf = await getCsrf(context);
  if (!csrf) {
    throw new Error('missing _csrf_token after opening wiki page');
  }

  const successes = [];
  const failures = [];
  console.error(`discovered ${entries.length} video blocks`);

  for (const [index, entry] of entries.entries()) {
    try {
      console.error(`[${index + 1}/${entries.length}] ${entry.name}`);
      const { meta, bestTranscode } = await fetchVideoMeta(context.request, csrf, entry);
      const outPath = path.join(outDir, safeFileName(meta.name, `${entry.fileToken}.mp4`));

      let result;
      try {
        const existing = await fs.stat(outPath);
        if (existing.size > 0) {
          console.error(`skip existing ${outPath}`);
          result = {
            outPath,
            size: existing.size,
            mime: meta.mime_type,
            type: meta.type,
            quality: bestTranscode.quality,
            skipped: true,
          };
        }
      } catch {
        // File does not exist yet, continue to download.
      }

      if (!result) {
        result = await downloadVideo(context.request, entry, meta, bestTranscode);
      }

      successes.push({
        fileToken: entry.fileToken,
        mountNodeToken: entry.mountNodeToken,
        name: meta.name || entry.name,
        ...result,
      });
      console.error(`ok ${result.skipped ? 'skipped' : 'downloaded'} ${result.outPath}`);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      failures.push({
        fileToken: entry.fileToken,
        mountNodeToken: entry.mountNodeToken,
        name: entry.name,
        reason,
      });
      console.error(`fail ${entry.name}: ${reason}`);
    }
  }

  const summaryPath = path.join(outDir, 'download-summary.json');
  await fs.writeFile(
    summaryPath,
    JSON.stringify(
      {
        wikiToken,
        outDir,
        discovered: entries.length,
        successCount: successes.length,
        failureCount: failures.length,
        successes,
        failures,
      },
      null,
      2,
    ),
  );

  console.log(
    JSON.stringify(
      {
        script: path.resolve('scripts/download_wutg_videos_batch.mjs'),
        outDir,
        discovered: entries.length,
        successCount: successes.length,
        failureCount: failures.length,
        summaryPath,
        failures,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
