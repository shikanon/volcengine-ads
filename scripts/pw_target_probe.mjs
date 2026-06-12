import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';

const url = 'https://bytedance.larkoffice.com/wiki/SqcnwztOOirrFbkSLSEc9zGuntd';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();
const events = [];

page.on('request', async (req) => {
  const u = req.url();
  if (/(box\/file\/info|box\/file\/cdn_url|stream\/download\/video|lf\d+-drive\.feishucdn\.com\/object\/1000\/box-file)/i.test(u)) {
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
  if (/(box\/file\/info|box\/file\/cdn_url|stream\/download\/video|lf\d+-drive\.feishucdn\.com\/object\/1000\/box-file)/i.test(u) || /(video|octet-stream)/i.test(ct)) {
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
      headers,
      contentType: ct,
      bodySnippet,
    });
  }
});

await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
const cookies = await context.cookies();
await browser.close();
await fs.writeFile('/tmp/lark_target_probe.json', JSON.stringify({ url, cookies, events }, null, 2));
console.log('/tmp/lark_target_probe.json');
