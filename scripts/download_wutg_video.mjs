import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const wikiToken = 'WutgwjNvxienAqkVmwfc1sMZnqe';
const fileToken = 'UxZubZEh5oX5U9xZqVFcq0j4nWc';
const mountNodeToken = 'KiyRd6xxZo2qhLxApejcDlJKnHb';

const outDir = path.join(os.homedir(), 'Downloads', 'lark-wiki-videos', wikiToken);
const wikiUrl = `https://bytedance.larkoffice.com/wiki/${wikiToken}`;

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();

try {
  // First open the shared wiki page so the browser context gets the same anonymous/session cookies as a real page load.
  await page.goto(wikiUrl, { waitUntil: 'networkidle', timeout: 45000 });

  const cookies = await context.cookies();
  const csrf = cookies.find((cookie) => cookie.name === '_csrf_token' && cookie.domain.includes('larkoffice.com'))?.value;
  if (!csrf) {
    throw new Error('missing _csrf_token after opening wiki page');
  }

  const infoRes = await context.request.post('https://bytedance.larkoffice.com/space/api/box/file/info/', {
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
      file_token: fileToken,
      mount_point: 'docx_file',
      mount_node_token: mountNodeToken,
      option_params: ['preview_meta', 'check_cipher'],
    },
  });
  if (!infoRes.ok()) {
    throw new Error(`file/info http ${infoRes.status()}`);
  }

  const infoJson = await infoRes.json();
  const meta = infoJson?.data;
  const transcode720 = meta?.preview_meta?.data?.['3']?.content?.transcode_urls?.['720p'];
  if (infoJson?.code !== 0 || !transcode720) {
    throw new Error(`unexpected file/info payload: ${JSON.stringify(infoJson).slice(0, 500)}`);
  }

  await fs.mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, meta.name || `${fileToken}.mp4`);
  const streamUrl = `${transcode720}&data_version=${encodeURIComponent(meta.data_version)}&mount_point=docx_file`;

  const videoRes = await context.request.get(streamUrl, {
    headers: {
      referer: 'https://bytedance.larkoffice.com/',
      range: 'bytes=0-',
      'accept-encoding': 'identity;q=1, *;q=0',
    },
    timeout: 180000,
  });
  if (!videoRes.ok()) {
    throw new Error(`stream http ${videoRes.status()}`);
  }

  const buffer = await videoRes.body();
  await fs.writeFile(outPath, buffer);
  const stat = await fs.stat(outPath);

  console.log(
    JSON.stringify(
      {
        outPath,
        size: stat.size,
        mime: meta.mime_type,
        type: meta.type,
        streamUrl,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
