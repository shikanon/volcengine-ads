import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';

const urls = [
  'https://bytedance.larkoffice.com/wiki/JRqNw1YZWiu2q2kfLJicBn6Xndf',
  'https://bytedance.larkoffice.com/wiki/SqcnwztOOirrFbkSLSEc9zGuntd',
  'https://bytedance.larkoffice.com/wiki/IUgXw5UIViY6lPkcYpJc9hhLnOR',
];

const results = [];
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();

for (const url of urls) {
  const page = await context.newPage();
  const events = [];

  page.on('request', (req) => {
    const u = req.url();
    if (u.includes('bytedance.larkoffice.com/space/api/')) {
      events.push({
        kind: 'request',
        method: req.method(),
        url: u,
        resourceType: req.resourceType(),
        headers: req.headers(),
      });
    }
  });

  page.on('response', async (res) => {
    const u = res.url();
    const headers = res.headers();
    const ct = headers['content-type'] || '';
    if (u.includes('bytedance.larkoffice.com/space/api/') || /(video|octet-stream)/i.test(ct)) {
      let bodySnippet = '';
      if (/json/i.test(ct)) {
        try {
          bodySnippet = (await res.text()).slice(0, 1500);
        } catch {
          bodySnippet = '';
        }
      }
      events.push({
        kind: 'response',
        status: res.status(),
        url: u,
        contentType: ct,
        headers,
        bodySnippet,
      });
    }
  });

  let gotoError = null;
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
  } catch (err) {
    gotoError = err.message;
  }

  const title = await page.title().catch(() => '');
  const bodyText = await page.locator('body').innerText().catch(() => '');
  const bodyHtml = await page.locator('body').innerHTML().catch(() => '');
  const videoCount = await page.locator('video').count().catch(() => 0);
  const iframeCount = await page.locator('iframe').count().catch(() => 0);
  const playTextCount = await page.getByText(/视频|播放|预览|附件|下载/).count().catch(() => 0);

  results.push({
    url,
    gotoError,
    title,
    bodyTextHead: bodyText.slice(0, 1000),
    bodyHtmlHead: bodyHtml.slice(0, 2000),
    videoCount,
    iframeCount,
    playTextCount,
    events,
  });
  await page.close();
}

await browser.close();
await fs.writeFile('/tmp/lark_wiki_probe.json', JSON.stringify(results, null, 2));
console.log('/tmp/lark_wiki_probe.json');
