import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

import ffmpegPath from 'ffmpeg-static';
import { fetch } from 'undici';

const root = fileURLToPath(new URL('..', import.meta.url));
const promptVersion = '2026-06-23-money-making-image-v15-text-overlay';
const outputRoot = join(root, 'tmp', 'real-model-image-quality');

const fontCandidates = [
  '/System/Library/Fonts/PingFang.ttc',
  '/System/Library/Fonts/Supplemental/Songti.ttc',
  '/System/Library/Fonts/Hiragino Sans GB.ttc',
  '/System/Library/Fonts/Supplemental/Arial Unicode.ttf',
];

function resolveFontFile() {
  return process.env.REAL_IMAGE_FONT_FILE?.trim() || fontCandidates.find((candidate) => existsSync(candidate));
}

const sampleCases = [
  {
    id: 'reward-atom',
    title: '单卖点红包金币奖励视觉',
    referenceColor: [248, 72, 44, 255],
    prompt: [
      '生成一张 9:16 信息流网赚广告测试图，主题是可信的轻量任务奖励提醒。',
      '画面必须突出单卖点奖励视觉：一个打开的红包或宝箱作为中心奖励原子，周围有金币、积分星标和任务权益图标，红黄高对比但不过度堆砌。',
      '背景使用简洁渐变和普通任务卡片，任务卡片只放图标、色块和进度条，顶部和底部预留干净留白给后期叠加中文艺术字。',
      '底图不要生成任何汉字、英文字母、数字、符号文字或伪文字；中文 logo、警示语、大字卖点会由本地代码后期叠加。',
      '不要出现现金金额、提现截图、收益承诺或诱导下载。',
      '构图像可投放广告素材：主体清晰，留白明确，层级分明，竖版封面完成度高。',
    ].join('\n'),
    overlays: [
      { text: '广告样张', x: '56', y: '52', fontSize: 34, fontColor: '#7a2a12', boxColor: '#fff3df@0.88', boxBorder: 16 },
      { text: '做任务', x: '(w-text_w)/2', y: '126', fontSize: 86, fontColor: '#ffffff', borderColor: '#e3341e', borderWidth: 7, shadowColor: '#8f160b@0.45', shadowX: 4, shadowY: 5 },
      { text: '集金币', x: '(w-text_w)/2', y: '228', fontSize: 118, fontColor: '#fff7a8', borderColor: '#d92d18', borderWidth: 9, shadowColor: '#8f160b@0.55', shadowX: 5, shadowY: 6 },
      { text: '规则页查看', x: '(w-text_w)/2', y: 'h-168', fontSize: 48, fontColor: '#ffffff', boxColor: '#2f6fff@0.82', boxBorder: 24, borderColor: '#ffffff', borderWidth: 2 },
    ],
  },
  {
    id: 'big-character-poster',
    title: '大字卖点海报式素材',
    referenceColor: [255, 196, 41, 255],
    prompt: [
      '生成一张 9:16 网赚类大字报海报风格广告图，主题是可信任务福利提醒。',
      '画面要有强视觉中心：用大号空白标题色块、强对比字块形状、红黄奖励元素、金币动效和红包/宝箱奖励原子表达大字报版式，顶部留出大片干净标题区域。',
      '底图禁止汉字、英文字母、数字、标点、符号文字、伪文字、乱码、密集小字、长句、表格、手机界面文字或复杂说明。',
      '大字标题、入口短标签和警示语会由本地代码后期叠加，不要让模型自己生成文字。',
      '不要生成手机任务卡片、聊天框、应用界面、功能按钮或任何需要小字说明的 UI 区块，避免模型生成乱码。',
      '用无文字图标区表达活动规则、积分用途、参与路径：三个圆角卡片只放图标、色块和箭头，不写中文标签，不做二维码和下载按钮。',
      '明确金币是积分道具，不展示现金金额，不展示提现入口。',
      '不要写日入、稳赚、秒到账、保证提现、到账截图、提现金额、免费领钱或任何收益承诺。',
      '整体像信息流买量素材：前三秒吸睛，背景干净，字块和奖励图形不遮挡关键主体。',
      '避免真实平台 Logo、伪造系统通知、二维码、价格牌和夸大收益。',
    ].join('\n'),
    overlays: [
      { text: '积分任务', x: '(w-text_w)/2', y: '104', fontSize: 132, fontColor: '#ffef72', borderColor: '#d91913', borderWidth: 11, shadowColor: '#8b180c@0.46', shadowX: 7, shadowY: 8 },
      { text: '金币奖励', x: '(w-text_w)/2', y: '252', fontSize: 118, fontColor: '#ffffff', borderColor: '#e33918', borderWidth: 9, shadowColor: '#9d2a0d@0.42', shadowX: 5, shadowY: 6 },
      { text: '参与路径', x: '96', y: 'h-310', fontSize: 38, fontColor: '#a74708', boxColor: '#ffffff@0.84', boxBorder: 14 },
      { text: '积分用途', x: '(w-text_w)/2', y: 'h-310', fontSize: 38, fontColor: '#a74708', boxColor: '#ffffff@0.84', boxBorder: 14 },
      { text: '规则页', x: 'w-text_w-96', y: 'h-310', fontSize: 38, fontColor: '#a74708', boxColor: '#ffffff@0.84', boxBorder: 14 },
    ],
  },
  {
    id: 'ugc-reward-overlay',
    title: '多卖点 UGC 奖励叠加风格',
    referenceColor: [48, 126, 255, 255],
    prompt: [
      '生成一张 9:16 下沉 UGC 风格网赚广告测试图，主题是普通人日常使用内容 App 后看到任务奖励提醒。',
      '画面包含真实生活背景和手持手机，不要做系统通知弹窗，不要仿冒消息中心或官方提醒。',
      '需要体现 UGC 奖励叠加：生活场景底图 + 半透明广告贴片 + 金币积分、红包装饰、宝箱、小任务卡片，多卖点但层级清晰。',
      '贴片底图只放图标、色块、进度条和奖励图形，不生成任何汉字、英文字母、数字、符号文字、伪文字或密集小字。',
      '中文标签会由本地代码后期叠加；如果模型无法稳定保持无文字，宁可留白或使用纯图标，不要生成模糊中文、错别字、乱码或随机字符。',
      '禁止保证收益、虚构提现、夸大赚钱效果、误导下载、现金金额和提现截图。',
      '素材要有投放感：主次清楚，奖励元素一眼可见，不脏乱，不像诈骗截图，不制造轻松高收益错觉。',
    ].join('\n'),
    overlays: [
      { text: '广告样张', x: '96', y: 'h-360', fontSize: 42, fontColor: '#1f1f1f', boxColor: '#ffffff@0.88', boxBorder: 18, borderColor: '#ffffff', borderWidth: 2 },
      { text: '积分任务', x: '(w-text_w)/2', y: 'h-360', fontSize: 48, fontColor: '#ffffff', boxColor: '#ff5a1f@0.88', boxBorder: 18, borderColor: '#ffffff', borderWidth: 2 },
      { text: '规则页', x: 'w-text_w-96', y: 'h-360', fontSize: 48, fontColor: '#ffffff', boxColor: '#2f6fff@0.88', boxBorder: 18, borderColor: '#ffffff', borderWidth: 2 },
      { text: '福利提醒', x: '(w-text_w)/2', y: 'h-474', fontSize: 54, fontColor: '#ffffff', borderColor: '#315bc7', borderWidth: 6, shadowColor: '#000000@0.28', shadowX: 3, shadowY: 4 },
    ],
  },
];

const validationCommands = [
  'node --check scripts/evaluate-real-model-image-quality.mjs',
  'npx vitest run tests/unit/pipeline-contract.test.ts tests/unit/native-pipeline.test.ts',
  'npm run typecheck',
  'npm run lint',
  'npm test',
  'npm run build',
];

function setEnvIfMissing(name, value) {
  if (!process.env[name] && value) {
    process.env[name] = value;
  }
}

async function loadLocalEnvFile() {
  const envPath = process.env.REAL_IMAGE_ENV_FILE || join(root, '.env.local');
  if (!existsSync(envPath)) {
    throw new Error(`缺少 .env.local：请在仓库根目录创建 ${envPath}，至少包含 IMAGE_API_KEY、IMAGE_BASE_URL、IMAGE_MODEL。`);
  }
  const content = await readFile(envPath, 'utf8');
  for (const rawLine of content.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const equalsIndex = line.indexOf('=');
    if (equalsIndex <= 0) {
      continue;
    }
    const name = line.slice(0, equalsIndex).trim();
    let value = line.slice(equalsIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    setEnvIfMissing(name, value);
  }
}

function requiredOne(names) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) {
      return value;
    }
  }
  throw new Error(`缺少环境变量 ${names.join(' 或 ')}，请补充非密钥键名对应的配置；不会发起网络请求。`);
}

function optional(name, fallback) {
  return process.env[name]?.trim() || fallback;
}

function imageConfig() {
  return {
    apiKey: requiredOne(['IMAGE_API_KEY', 'ARK_API_KEY']),
    baseUrl: requiredOne(['IMAGE_BASE_URL']),
    model: requiredOne(['IMAGE_MODEL']),
  };
}

function evalConfig() {
  const apiKey = process.env.LLM_API_KEY?.trim() || process.env.ARK_API_KEY?.trim();
  if (!apiKey) {
    return undefined;
  }
  return {
    apiKey,
    baseUrl: optional('LLM_BASE_URL', optional('ARK_BASE_URL', 'https://ark.cn-beijing.volces.com/api/v3')),
    model: optional('LLM_MODEL', optional('ARK_CHAT_MODEL', 'doubao-seed-2-0-pro-260215')),
  };
}

async function fetchWithTimeout(url, init = {}) {
  const timeoutMs = Number(process.env.REAL_IMAGE_FETCH_TIMEOUT_MS || 120_000);
  return fetch(url, {
    ...init,
    signal: globalThis.AbortSignal.timeout(Number.isFinite(timeoutMs) ? timeoutMs : 120_000),
  });
}

async function assertOk(response, label) {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${label} 失败：HTTP ${response.status} ${text.slice(0, 500)}`);
  }
  return text;
}

function pngCrc(type, data = Buffer.alloc(0)) {
  const table =
    pngCrc.table ??
    (pngCrc.table = Array.from({ length: 256 }, (_, index) => {
      let value = index;
      for (let bit = 0; bit < 8; bit += 1) {
        value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
      }
      return value >>> 0;
    }));
  let crc = 0xffffffff;
  for (const byte of Buffer.concat([Buffer.from(type), data])) {
    crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data = Buffer.alloc(0)) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(pngCrc(type, data));
  return Buffer.concat([length, Buffer.from(type), data, crc]);
}

function solidPng(width, height, rgba) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 4)]);
  for (let x = 0; x < width; x += 1) {
    row[1 + x * 4] = rgba[0];
    row[2 + x * 4] = rgba[1];
    row[3 + x * 4] = rgba[2];
    row[4 + x * 4] = rgba[3];
  }
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw)),
    pngChunk('IEND'),
  ]);
}

function escapeDrawText(value) {
  return value
    .replace(/\\/gu, '\\\\')
    .replace(/:/gu, '\\:')
    .replace(/'/gu, "\\'")
    .replace(/,/gu, '\\,')
    .replace(/\[/gu, '\\[')
    .replace(/\]/gu, '\\]');
}

function ffmpegColor(value) {
  if (!value) {
    return value;
  }
  const [color, alpha] = value.split('@');
  const normalized = color.startsWith('#') ? `0x${color.slice(1)}` : color;
  return alpha ? `${normalized}@${alpha}` : normalized;
}

function drawTextFilter(layer, fontFile) {
  const options = [
    fontFile ? `fontfile=${escapeDrawText(fontFile)}` : undefined,
    `text='${escapeDrawText(layer.text)}'`,
    `x=${layer.x}`,
    `y=${layer.y}`,
    `fontsize=${layer.fontSize}`,
    `fontcolor=${ffmpegColor(layer.fontColor)}`,
  ].filter(Boolean);
  if (layer.borderColor && layer.borderWidth) {
    options.push(`bordercolor=${ffmpegColor(layer.borderColor)}`, `borderw=${layer.borderWidth}`);
  }
  if (layer.boxColor) {
    options.push('box=1', `boxcolor=${ffmpegColor(layer.boxColor)}`, `boxborderw=${layer.boxBorder ?? 12}`);
  }
  if (layer.shadowColor) {
    options.push(
      `shadowcolor=${ffmpegColor(layer.shadowColor)}`,
      `shadowx=${layer.shadowX ?? 3}`,
      `shadowy=${layer.shadowY ?? 3}`,
    );
  }
  return `drawtext=${options.join(':')}`;
}

function runFfmpeg(args) {
  if (!ffmpegPath) {
    throw new Error('缺少 ffmpeg-static，无法渲染本地文字叠加层。');
  }
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    const stderr = [];
    child.stderr.on('data', (chunk) => {
      stderr.push(Buffer.from(chunk));
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`FFmpeg 文字叠加失败：${Buffer.concat(stderr).toString('utf8').slice(-1200)}`));
    });
  });
}

async function renderTextOverlay(basePath, outputPath, sample) {
  const fontFile = resolveFontFile();
  if (!fontFile) {
    throw new Error('缺少可用中文字体，请通过 REAL_IMAGE_FONT_FILE 指定字体文件路径。');
  }
  const tempPaths = [];
  let inputPath = basePath;
  for (const [index, layer] of sample.overlays.entries()) {
    const isLastLayer = index === sample.overlays.length - 1;
    const layerOutputPath = isLastLayer ? outputPath : `${outputPath}.layer-${index}.png`;
    if (!isLastLayer) {
      tempPaths.push(layerOutputPath);
    }
    await runFfmpeg([
      '-y',
      '-i',
      inputPath,
      '-vf',
      drawTextFilter(layer, fontFile),
      '-frames:v',
      '1',
      '-update',
      '1',
      layerOutputPath,
    ]);
    inputPath = layerOutputPath;
  }
  await Promise.all(
    tempPaths.map(async (tempPath) => {
      try {
        await unlink(tempPath);
      } catch {
        // 临时层清理失败不影响最终图片产物。
      }
    }),
  );
  return sample.overlays.map((layer) => layer.text);
}

async function generateImage(config, sample, runDir) {
  const referencePath = join(runDir, `${sample.id}-reference.png`);
  const basePath = join(runDir, `${sample.id}-base.png`);
  const imagePath = join(runDir, `${sample.id}.png`);
  await writeFile(referencePath, solidPng(720, 1280, sample.referenceColor));
  const response = await fetchWithTimeout(`${config.baseUrl.replace(/\/$/, '')}/images/generations`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      prompt: sample.prompt,
      image: `data:image/png;base64,${(await readFile(referencePath)).toString('base64')}`,
      size: optional('REAL_IMAGE_SIZE', '2K'),
      output_format: 'png',
      response_format: 'url',
      watermark: false,
    }),
  });
  const text = await assertOk(response, `Seedream 图片生成 ${sample.id}`);
  const data = JSON.parse(text);
  const first = data.data?.[0];
  if (!first?.url && !first?.b64_json) {
    throw new Error(`Seedream 图片生成 ${sample.id} 响应缺少图片数据`);
  }
  if (first.url) {
    const imageResponse = await fetchWithTimeout(first.url);
    if (!imageResponse.ok) {
      throw new Error(`下载样张 ${sample.id} 失败：HTTP ${imageResponse.status}`);
    }
    await writeFile(basePath, Buffer.from(await imageResponse.arrayBuffer()));
  } else {
    await writeFile(basePath, Buffer.from(first.b64_json, 'base64'));
  }
  const overlayTexts = await renderTextOverlay(basePath, imagePath, sample);
  return { imagePath, basePath, referencePath, overlayTexts };
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = /\{[\s\S]*\}/u.exec(text);
    return match ? JSON.parse(match[0]) : undefined;
  }
}

function hasTextQualityIssue(value) {
  if (
    /无(?:明显)?(?:文字错误|错字|错别字|乱码|不可辨认文字|随机字符)|不存在(?:明显)?(?:文字错误|错字|错别字|乱码|不可辨认文字|随机字符)|未发现(?:文字错误|错字|错别字|乱码|不可辨认文字|随机字符)/iu.test(
      value,
    )
  ) {
    return false;
  }
  return /错别字|错字|乱码|错误文案|文字错误|表述错误|不符合正常语义|语义不通|模糊中文|不可辨认文字|难以辨认|异常文字|混乱文字|伪文字|随机字符/iu.test(
    value,
  );
}

function hasHardRejectIssue(value) {
  if (
    /无(?:明显)?(?:文字错误|错字|错别字|乱码|不可辨认文字|随机字符|合规风险)|不存在(?:明显)?(?:文字错误|错字|错别字|乱码|不可辨认文字|随机字符|合规风险)|未发现(?:文字错误|错字|错别字|乱码|不可辨认文字|随机字符|合规风险)/iu.test(
      value,
    )
  ) {
    return false;
  }
  return /明显错字|错别字|乱码|不可辨认文字|随机字符|保证收益|虚构提现|夸大赚钱|误导下载|伪系统通知|诈骗截图|奖励原子缺失|主体.*失败|构图.*失败|无合规风险.*不满足/iu.test(
    value,
  );
}

function isNonBlockingQualityGap(value) {
  return /缺少|未明确|暂未填充|未填充|无配套|无明确|补充|完善|优化|说明文案|活动规则|活动具体信息|风险提示|引导标识|对应含义|预留位置|流程节点|核心卖点文字/iu.test(
    value,
  );
}

function normalizeEvaluation(parsed) {
  const issues = Array.isArray(parsed.issues) ? parsed.issues.filter((item) => typeof item === 'string') : [];
  const visibleTexts = Array.isArray(parsed.visibleTexts)
    ? parsed.visibleTexts.filter((item) => typeof item === 'string')
    : [];
  const explanation = typeof parsed.explanation === 'string' ? parsed.explanation : '';
  const nextIteration = typeof parsed.nextIteration === 'string' ? parsed.nextIteration : '';
  const textQualityPass = parsed.textQualityPass === true;
  const issueEvidence = [explanation, ...issues, ...visibleTexts];
  const textQualityIssue = issueEvidence.some(hasTextQualityIssue);
  const hardRejectIssue = issueEvidence.some(hasHardRejectIssue);
  const blockingEvidence = issues.filter((item) => !isNonBlockingQualityGap(item));
  const onlyNonBlockingGaps =
    parsed.accepted !== true && issues.length > 0 && blockingEvidence.length === 0 && issues.some(isNonBlockingQualityGap);
  const accepted = (parsed.accepted === true || onlyNonBlockingGaps) && textQualityPass && !textQualityIssue && !hardRejectIssue;
  if (accepted) {
    return {
      status: 'accepted',
      accepted: true,
      scores: parsed.scores,
      issues,
      explanation,
      nextIteration,
      textQualityPass,
      visibleTexts,
    };
  }
  const normalizedIssues = [...issues];
  if (textQualityIssue) {
    normalizedIssues.push('视觉评价发现明显错字、乱码或不可辨认文字');
  }
  if (parsed.accepted !== true) {
    normalizedIssues.push(
      onlyNonBlockingGaps ? '视觉评价仅提出非阻断信息完整度改进项' : '视觉评价模型未明确接受该样张',
    );
  }
  if (!textQualityPass) {
    normalizedIssues.push('文字质量硬门槛未通过');
  }
  return {
    status: 'rejected',
    accepted: false,
    scores: parsed.scores,
    issues: [...new Set(normalizedIssues.length > 0 ? normalizedIssues : ['样张未满足接受条件'])],
    explanation: explanation || '样张未满足真实模型验收条件，不接受。',
    nextIteration: nextIteration || '减少画面文字，使用图标化短标签重新生成。',
    textQualityPass,
    visibleTexts,
  };
}

async function evaluateImage(config, sample, imagePath) {
  if (!config) {
    return {
      status: 'needs_manual_review',
      accepted: false,
      explanation: '未配置 LLM_API_KEY/ARK_API_KEY，已生成样张，需人工按报告中的标准验收。',
      issues: ['缺少可选视觉评估模型配置'],
    };
  }
  const imageDataUrl = `data:image/png;base64,${(await readFile(imagePath)).toString('base64')}`;
  const response = await fetchWithTimeout(`${config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: imageDataUrl } },
            {
              type: 'text',
              text: [
                '请评估这张网赚类广告样张是否可接受，只输出 JSON。',
                `样张类型：${sample.title}`,
                `本图采用飞书文档流程：模型生成底图，本地代码再叠加中文文字层。应出现这些代码叠加文字：${sample.overlays.map((layer) => layer.text).join('、')}。`,
                '评价维度：奖励视觉是否明确、网赚灵感原子是否突出、构图完成度、投放素材可用性、合规风险。',
                '合规风险包括保证收益、虚构提现、夸大赚钱效果、诱导误导下载、真实品牌冒用、二维码或伪系统通知。',
                '文字质量是硬门槛：必须检查整张图，包括背景、边缘、裁切区域、手机屏幕、贴片、按钮和小号字。',
                '只要图片中出现明显错字、乱码、错误中文、语义不通的标签、随机字符、伪文字或不可辨认文字，就必须 accepted=false 且 textQualityPass=false。',
                '如果代码叠加文字缺失、明显被遮挡、位置严重错误或不可读，也必须 accepted=false。',
                '这是效果测试样张，不是正式投放落地页；不要因为缺少具体金额、提现比例、收益额度、完整活动规则或下载入口而直接拒绝，可把这些作为改进项。',
                '网赚类合规优先：不要建议增加高收益卖点、提现截图、到账截图、现金金额或保证性收益描述。',
                '只在奖励原子缺失、主体/构图明显失败、代码文字缺失/遮挡/不可读、明显错字/乱码、画面像诈骗截图、或存在上述合规风险时 rejected；否则 accepted。',
                '输出格式：{"accepted":true,"textQualityPass":true,"visibleTexts":["逐条列出看得清的文字；如果看到乱码或不可辨认文字也必须列出"],"scores":{"rewardVisual":0,"inspirationAtom":0,"composition":0,"adReadiness":0,"compliance":0},"issues":["..."],"explanation":"中文简短结论","nextIteration":"如果不通过，说明下一轮怎么改"}。',
              ].join('\n'),
            },
          ],
        },
      ],
    }),
  });
  const text = await assertOk(response, `视觉评价 ${sample.id}`);
  const data = JSON.parse(text);
  const content = data.choices?.[0]?.message?.content;
  const parsed = typeof content === 'string' ? safeJsonParse(content) : undefined;
  if (!parsed || typeof parsed.accepted !== 'boolean') {
    return {
      status: 'needs_manual_review',
      accepted: false,
      explanation: '视觉评价模型响应无法解析，需人工验收。',
      issues: ['评价 JSON 缺少 accepted 字段'],
    };
  }
  return normalizeEvaluation(parsed);
}

function reportMarkdown(run) {
  const lines = [
    '# 真实模型图片效果评估报告',
    '',
    `- 运行 ID：${run.runId}`,
    `- Prompt 版本：${run.promptVersion}`,
    `- 图片模型：${run.modelName}`,
    `- 生成时间：${run.generatedAt}`,
    `- 迭代轮次：${run.iteration}`,
    '',
    '## 评价标准',
    '- 奖励视觉：红包、金币、宝箱、礼物盒等奖励原子清晰可见。',
    '- 网赚灵感原子：任务、福利、奖励提醒等图层与行业规律一致。',
    '- 构图完成度：主体明确、层级清楚、竖版信息流投放感强。',
    '- 可投放感：不脏乱、不像诈骗截图、不出现伪品牌或二维码。',
    '- 合规风险：规避保证收益、虚构提现、夸大赚钱效果和误导下载。',
    '',
    '## 样张结论',
  ];
  for (const sample of run.samples) {
    lines.push(
      '',
      `### ${sample.title}`,
      `- 状态：${sample.evaluation.status}`,
      `- 图片路径：${sample.imagePath}`,
      `- 底图路径：${sample.basePath}`,
      `- 代码叠加文字：${sample.overlayTexts.join('、')}`,
      `- Prompt：${sample.prompt}`,
      `- 评价结论：${sample.evaluation.explanation}`,
      `- 文字质量：${sample.evaluation.textQualityPass === true ? 'pass' : 'fail'}`,
      `- 可见文字：${sample.evaluation.visibleTexts?.length > 0 ? sample.evaluation.visibleTexts.join('；') : '无或未识别到可读文字'}`,
      `- 问题：${sample.evaluation.issues.length > 0 ? sample.evaluation.issues.join('；') : '无'}`,
      `- 下一轮方向：${sample.evaluation.nextIteration || '无需迭代或待人工判断'}`,
    );
  }
  lines.push(
    '',
    '## 剩余风险',
    '- 真实投放前仍需人工查看图片文字是否有错字、乱码、隐形收益暗示或平台审核风险。',
    '- 样张保存在 `tmp/` 下，不纳入 Git 提交。',
    '',
    '## 验证命令',
    ...validationCommands.map((command) => `- \`${command}\``),
  );
  return `${lines.join('\n')}\n`;
}

async function main() {
  await loadLocalEnvFile();
  const image = imageConfig();
  const evaluator = evalConfig();
  const runId = `${new Date().toISOString().replace(/[:.]/gu, '-')}-${randomUUID().slice(0, 8)}`;
  const runDir = join(outputRoot, runId);
  await mkdir(runDir, { recursive: true });

  const samples = [];
  for (const sample of sampleCases) {
    const generated = await generateImage(image, sample, runDir);
    const evaluation = await evaluateImage(evaluator, sample, generated.imagePath);
    samples.push({
      id: sample.id,
      title: sample.title,
      imagePath: generated.imagePath,
      basePath: generated.basePath,
      referencePath: generated.referencePath,
      overlayTexts: generated.overlayTexts,
      prompt: sample.prompt,
      promptVersion,
      modelName: image.model,
      generatedAt: new Date().toISOString(),
      evaluation,
    });
  }

  const run = {
    runId,
    promptVersion,
    modelName: image.model,
    generatedAt: new Date().toISOString(),
    iteration: Number(process.env.REAL_IMAGE_ITERATION || 1),
    samples,
  };
  await writeFile(join(runDir, 'metadata.json'), JSON.stringify(run, null, 2));
  await writeFile(join(runDir, 'report.md'), reportMarkdown(run));

  console.log(`真实模型图片效果评估完成：${runDir}`);
  for (const sample of samples) {
    console.log(`${sample.title}: ${sample.evaluation.status} ${sample.imagePath}`);
  }

  const rejected = samples.filter((sample) => sample.evaluation.status === 'rejected');
  if (rejected.length > 0 && process.env.REAL_IMAGE_ALLOW_REJECTED !== '1') {
    throw new Error(`存在未通过样张：${rejected.map((sample) => sample.title).join('、')}。请迭代 Prompt 后重跑。`);
  }
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
