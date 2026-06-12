import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';

const url = 'https://bytedance.larkoffice.com/wiki/WutgwjNvxienAqkVmwfc1sMZnqe';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();
const events = [];

page.on('request', (req) => {
  const u = req.url();
  if (/(box\/file\/info|box\/file\/cdn_url|stream\/download\/video|lf\d+-drive\.feishucdn\.com\/object\/1000\/box-file|space\/api\/wiki|space\/api\/docx\/pages\/client_vars)/i.test(u)) {
    events.push({
      kind: 'request',
      method: req.method(),
      url: u,
      headers: req.headers(),
      postData: req.postData(),
    });
  }
});

page.on('response', async (res) => {
  const u = res.url();
  const headers = res.headers();
  const ct = headers['content-type'] || '';
  if (/(box\/file\/info|box\/file\/cdn_url|stream\/download\/video|lf\d+-drive\.feishucdn\.com\/object\/1000\/box-file|space\/api\/wiki|space\/api\/docx\/pages\/client_vars)/i.test(u) || /(video|octet-stream)/i.test(ct)) {
    let bodySnippet = '';
    if (/json/i.test(ct)) {
      try {
        bodySnippet = (await res.text()).slice(0, 2000);
      } catch {
        bodySnippet = '';
      }
    }
    events.push({
      kind: 'response',
      status: res.status(),
      url: u,
      headers,
      contentType: ct,
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
const text = await page.locator('body').innerText().catch(() => '');
const videoCount = await page.locator('video').count().catch(() => 0);
const iframeCount = await page.locator('iframe').count().catch(() => 0);
const cookies = await context.cookies();

await browser.close();
await fs.writeFile('/tmp/wutg_probe.json', JSON.stringify({ url, gotoError, title, textHead: text.slice(0, 1500), videoCount, iframeCount, cookies, events }, null, 2));
console.log('/tmp/wutg_probe.json');
