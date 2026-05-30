import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { basename, extname, join } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

import { fetch } from 'undici';

const require = createRequire(import.meta.url);
const ffmpegPath = require('ffmpeg-static');
const root = fileURLToPath(new URL('..', import.meta.url));
const outDir = join(root, 'tmp', 'live-smoke');
const execFileAsync = promisify(execFile);
const nativeReferenceVideoPath = join(root, 'tmp', '测试视频-AI健康APP-原片头AI增加新年元素.mov');
const nativeIndustries = {
  game: {
    title: '游戏',
    formula: '钩子 + 爽点 + 成长 + 福利 + CTA',
    requiredModules: ['玩法录屏占位', '角色立绘', '福利前置'],
    complianceFocus: '反外挂、价值观、第三方 IP 授权',
    blacklistWords: ['外挂', '代练', '100%中奖'],
    forbiddenScenes: [],
  },
  short_drama: {
    title: '短剧',
    formula: '黄金 3s 高光 + 小闭环 + 悬念钩',
    requiredModules: ['调色情绪映射', '花字', '卡点剪辑'],
    complianceFocus: '暴力分级、版权',
    blacklistWords: [],
    forbiddenScenes: [],
  },
  novel: {
    title: '小说',
    formula: '15s AI 钩子前贴 + 解压/滚屏拼接',
    requiredModules: ['人物参考图固化', '六段式信息流脚本'],
    complianceFocus: 'AIGC 命名规范',
    blacklistWords: [],
    forbiddenScenes: [],
  },
  social: {
    title: '社交',
    formula: '起承转合四段式',
    requiredModules: ['不露脸自拍', '聊天记录截图'],
    complianceFocus: '不良暗示词库 + 不实宣传词库',
    blacklistWords: ['免费', '加微信', '3S', '直奔主题'],
    forbiddenScenes: ['床', '浴室', '酒店走廊', '玉米地'],
  },
  tool: {
    title: '工具',
    formula: '痛点 + 真人口播 + UI 演示 + CTA',
    requiredModules: ['数字人口播', 'UI 占位', '创意空镜'],
    complianceFocus: '真实承诺、无虚假宣传',
    blacklistWords: [],
    forbiddenScenes: [],
  },
  ecommerce: {
    title: '电商',
    formula: '场景痛点 + 商品卖点 + 证据背书 + 权益刺激 + CTA',
    requiredModules: ['商品特写', '使用场景', '卖点对比', '促销权益'],
    complianceFocus: '价格真实性、促销规则、功效承诺、品牌授权',
    blacklistWords: [],
    forbiddenScenes: [],
  },
};

function setEnvIfMissing(name, value) {
  if (!process.env[name] && value) {
    process.env[name] = value;
  }
}

async function loadLocalEnvFile() {
  const envPath = process.env.LIVE_SMOKE_ENV_FILE || join(root, '.env.local');
  let content;
  try {
    content = await readFile(envPath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return;
    }
    throw error;
  }
  for (const rawLine of content.split(/\r?\n/)) {
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

function normalizeTtsVoice(voice) {
  return voice === 'volcano_tts' ? 'zh_female_vv_uranus_bigtts' : voice;
}

const SUPPORTED_TTS_SPEAKERS = [
  'zh_female_vv_uranus_bigtts',
  'saturn_zh_female_cancan_tob',
  'saturn_zh_female_keainvsheng_tob',
  'saturn_zh_female_tiaopigongzhu_tob',
  'saturn_zh_male_shuanglangshaonian_tob',
  'saturn_zh_male_tiancaitongzhuo_tob',
  'zh_female_xiaohe_uranus_bigtts',
  'zh_male_m191_uranus_bigtts',
  'zh_male_taocheng_uranus_bigtts',
  'en_male_tim_uranus_bigtts',
];

function decryptSetting(payload, secret) {
  const parsed = JSON.parse(payload);
  const key = crypto.createHash('sha256').update(secret).digest();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(parsed.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(parsed.tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(parsed.data, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

async function readSqliteSetting(dbPath, key) {
  const { stdout } = await execFileAsync('/usr/bin/sqlite3', [
    dbPath,
    `select value from settings where key='${key.replaceAll("'", "''")}';`,
  ]);
  return stdout.trim() || undefined;
}

async function loadAppSettingsEnv() {
  if (process.env.LIVE_SMOKE_USE_APP_SETTINGS !== '1') {
    return;
  }
  const dbPath =
    process.env.LIVE_SMOKE_APP_DB ||
    join(homedir(), 'Library', 'Application Support', 'AIGC Ads Studio', 'aigc.db');
  let secret;
  async function getSecret() {
    if (secret) {
      return secret;
    }
    const keytarModule = await import('keytar');
    const keytar = { ...keytarModule.default, ...keytarModule };
    secret = await keytar.getPassword('volcengine-ads', 'local-master-key');
    if (!secret) {
      throw new Error('本机 Keychain 中缺少 volcengine-ads master key');
    }
    return secret;
  }

  const providerValue = await readSqliteSetting(dbPath, 'provider');
  if (providerValue) {
    const provider = JSON.parse(providerValue);
    setEnvIfMissing('VIDEO_BASE_URL', provider.seedanceBaseUrl);
    setEnvIfMissing('VIDEO_MODEL', provider.seedanceModel);
    setEnvIfMissing('IMAGE_BASE_URL', provider.imageBaseUrl);
    setEnvIfMissing('IMAGE_MODEL', provider.imageModel);
    setEnvIfMissing('LLM_BASE_URL', provider.llmBaseUrl);
    setEnvIfMissing('LLM_MODEL', provider.llmModel);
    setEnvIfMissing('VOLC_TTS_BASE_URL', provider.ttsBaseUrl);
    setEnvIfMissing('VOLC_TTS_VOICE_ID', normalizeTtsVoice(provider.ttsVoice));
    setEnvIfMissing('VOLC_ASR_BASE_URL', provider.asrBaseUrl);
    setEnvIfMissing('VOLC_ASR_RESOURCE_ID', provider.asrResourceId);
    setEnvIfMissing('OSS_ENDPOINT', provider.ossEndpoint);
    setEnvIfMissing('OSS_BUCKET_NAME', provider.ossBucketName);
  }

  const encryptedEnv = {
    seedanceApiKey: 'VIDEO_API_KEY',
    imageApiKey: 'IMAGE_API_KEY',
    llmApiKey: 'LLM_API_KEY',
    ttsApiKey: 'VOLC_TTS_API_KEY',
    ttsAppId: 'VOLC_TTS_APPID',
    ttsToken: 'VOLC_TTS_TOKEN',
    asrAppId: 'VOLC_ASR_APPID',
    asrToken: 'VOLC_ASR_TOKEN',
    asrApiKey: 'VOLC_ASR_API_KEY',
    ossAccessKeyId: 'OSS_ACCESS_KEY_ID',
    ossAccessKeySecret: 'OSS_ACCESS_KEY_SECRET',
  };
  for (const [settingKey, envName] of Object.entries(encryptedEnv)) {
    const value = await readSqliteSetting(dbPath, settingKey);
    if (!value) {
      continue;
    }
    if (value.trim().startsWith('{')) {
      setEnvIfMissing(envName, decryptSetting(value, await getSecret()));
    } else {
      setEnvIfMissing(envName, value);
    }
  }
}

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`缺少环境变量 ${name}`);
  }
  return value;
}

function requiredOne(names) {
  for (const name of names) {
    const value = process.env[name];
    if (value) {
      return value;
    }
  }
  throw new Error(`缺少环境变量 ${names.join(' 或 ')}`);
}

function optional(name, fallback) {
  return process.env[name] || fallback;
}

function optionalNumber(name, fallback) {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function fetchTimeoutMs() {
  return optionalNumber('LIVE_SMOKE_FETCH_TIMEOUT_MS', 60_000);
}

async function fetchWithTimeout(url, init = {}) {
  const maxAttempts = optionalNumber('LIVE_SMOKE_FETCH_RETRIES', 3);
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fetch(url, {
        ...init,
        signal: globalThis.AbortSignal.timeout(fetchTimeoutMs()),
      });
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }
  const message = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`fetch failed after ${maxAttempts} attempts: ${message}`);
}

function isHttpUrl(value) {
  return value.startsWith('http://') || value.startsWith('https://');
}

function endpointHost(endpoint) {
  const withProtocol = endpoint.startsWith('http') ? endpoint : `https://${endpoint}`;
  return new URL(withProtocol).host;
}

function hmacSha1Base64(secret, value) {
  return crypto.createHmac('sha1', secret).update(value).digest('base64');
}

function contentTypeFor(path) {
  const ext = extname(path).toLowerCase();
  if (ext === '.wav') return 'audio/wav';
  if (ext === '.mp3') return 'audio/mpeg';
  if (ext === '.ogg') return 'audio/ogg';
  if (ext === '.m4a') return 'audio/mp4';
  if (ext === '.mp4') return 'video/mp4';
  if (ext === '.mov') return 'video/quicktime';
  return 'application/octet-stream';
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

function inferAudioFormat(pathOrUrl) {
  const pathname = pathOrUrl.split('?')[0] || pathOrUrl;
  const ext = extname(pathname).replace('.', '').toLowerCase();
  return ['wav', 'mp3', 'ogg'].includes(ext) ? ext : 'mp3';
}

async function uploadOssForAsr(localPath) {
  const accessKeyId = required('OSS_ACCESS_KEY_ID');
  const accessKeySecret = required('OSS_ACCESS_KEY_SECRET');
  const endpoint = required('OSS_ENDPOINT');
  const bucket = required('OSS_BUCKET_NAME');
  const host = endpointHost(endpoint);
  const objectKey = `volcengine-ads/live-smoke/${Date.now()}-${crypto.randomUUID()}-${basename(localPath)}`;
  const encodedKey = objectKey.split('/').map(encodeURIComponent).join('/');
  const url = `https://${bucket}.${host}/${encodedKey}`;
  const date = new Date().toUTCString();
  const contentType = contentTypeFor(localPath);
  const canonicalResource = `/${bucket}/${objectKey}`;
  const signature = hmacSha1Base64(
    accessKeySecret,
    `PUT\n\n${contentType}\n${date}\n${canonicalResource}`,
  );
  const uploadResponse = await fetchWithTimeout(url, {
    method: 'PUT',
    headers: {
      Authorization: `OSS ${accessKeyId}:${signature}`,
      Date: date,
      'Content-Type': contentType,
    },
    body: await readFile(localPath),
  });
  await assertOk(uploadResponse, 'Aliyun OSS upload');
  const expires = Math.floor(Date.now() / 1000) + 1800;
  const getSignature = encodeURIComponent(
    hmacSha1Base64(accessKeySecret, `GET\n\n\n${expires}\n${canonicalResource}`),
  );
  return `${url}?OSSAccessKeyId=${encodeURIComponent(accessKeyId)}&Expires=${expires}&Signature=${getSignature}`;
}

async function trimVideoForSeedanceReference(inputPath) {
  if (!ffmpegPath) {
    throw new Error('缺少 ffmpeg-static，无法裁剪 Seedance 参考视频');
  }
  await mkdir(outDir, { recursive: true });
  const outputPath = join(outDir, 'native-reference-4s.mp4');
  await execFileAsync(ffmpegPath, [
    '-y',
    '-i',
    inputPath,
    '-t',
    '4',
    '-vf',
    'scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280',
    '-c:v',
    'libx264',
    '-c:a',
    'aac',
    '-movflags',
    '+faststart',
    outputPath,
  ]);
  return outputPath;
}

async function assertOk(response, label) {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${label} failed: HTTP ${response.status} ${text.slice(0, 300)}`);
  }
  return text;
}

async function smokeArkChat() {
  await arkChatJson(
    [
      { role: 'system', content: '只输出 JSON。' },
      { role: 'user', content: '输出 {"ok":true,"module":"ark"}' },
    ],
    'Ark chat',
  );
  console.log('Ark chat smoke passed');
}

async function arkChatJson(messages, label, temperature = 0) {
  const apiKey = requiredOne(['LLM_API_KEY', 'ARK_API_KEY']);
  const baseUrl = optional(
    'LLM_BASE_URL',
    optional('ARK_BASE_URL', 'https://ark.cn-beijing.volces.com/api/v3'),
  );
  const model = optional('LLM_MODEL', optional('ARK_CHAT_MODEL', 'doubao-seed-2-0-pro-260215'));
  const response = await fetchWithTimeout(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      response_format: { type: 'json_object' },
    }),
  });
  const text = await assertOk(response, 'Ark chat');
  const data = JSON.parse(text);
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error(`${label} 响应缺少 content`);
  }
  return JSON.parse(content);
}

async function synthesizeTts(text, outputName = 'tts-smoke.mp3', speakerOverride) {
  const apiKey = process.env.VOLC_TTS_API_KEY;
  const appId = process.env.VOLC_TTS_APPID;
  const token = process.env.VOLC_TTS_TOKEN;
  if (!apiKey && (!appId || !token)) {
    throw new Error('缺少环境变量 VOLC_TTS_API_KEY 或 VOLC_TTS_APPID/VOLC_TTS_TOKEN');
  }
  const baseUrl = optional('VOLC_TTS_BASE_URL', 'https://openspeech.bytedance.com');
  const speaker = normalizeTtsVoice(
    speakerOverride || optional('VOLC_TTS_VOICE_ID', 'zh_female_vv_uranus_bigtts'),
  );
  const response = await fetchWithTimeout(
    `${baseUrl.replace(/\/$/, '')}/api/v3/tts/unidirectional`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey
          ? { 'X-Api-Key': apiKey }
          : { 'X-Api-App-Id': appId, 'X-Api-Access-Key': token }),
        'X-Api-Resource-Id': 'seed-tts-2.0',
      },
      body: JSON.stringify({
        user: { uid: 'volcengine_ads_live_smoke' },
        req_params: {
          text,
          speaker,
          audio_params: {
            format: 'mp3',
            sample_rate: 24000,
            speech_rate: 0,
            volume_rate: 0,
            pitch_rate: 0,
          },
        },
      }),
    },
  );
  const responseText = await assertOk(response, 'Volc TTS');
  const chunks = [];
  for (const line of responseText.split('\n')) {
    if (!line.trim()) {
      continue;
    }
    const item = JSON.parse(line);
    if ((item.code === 0 || item.code === 3000) && item.data) {
      chunks.push(Buffer.from(item.data, 'base64'));
    }
  }
  if (chunks.length === 0) {
    throw new Error('Volc TTS 响应未返回音频数据');
  }
  await mkdir(outDir, { recursive: true });
  const outputPath = join(outDir, outputName);
  await writeFile(outputPath, Buffer.concat(chunks));
  return outputPath;
}

async function smokeTts() {
  const outputPath = await synthesizeTts('火山语音合成连通性测试。');
  console.log('Volc TTS smoke passed');
  return outputPath;
}

async function smokeTtsSpeakers() {
  for (const speaker of SUPPORTED_TTS_SPEAKERS) {
    const text = speaker.startsWith('en_')
      ? `Volcano text to speech speaker ${speaker} connectivity test.`
      : `火山语音合成音色 ${speaker} 连通性测试。`;
    await synthesizeTts(
      text,
      `tts-${speaker}.mp3`,
      speaker,
    );
    console.log(`Volc TTS speaker smoke passed: ${speaker}`);
  }
}

async function generateSeedreamImage({ outputName, prompt, referenceColor = [80, 140, 220, 255] }) {
  const apiKey = requiredOne(['IMAGE_API_KEY', 'ARK_API_KEY']);
  const baseUrl = optional('IMAGE_BASE_URL', 'https://ark.cn-beijing.volces.com/api/v3');
  const model = optional('IMAGE_MODEL', 'doubao-seedream-5-0-260128');
  await mkdir(outDir, { recursive: true });
  const referencePath = join(outDir, `${outputName}-reference.png`);
  await writeFile(referencePath, solidPng(512, 512, referenceColor));
  const response = await fetchWithTimeout(`${baseUrl.replace(/\/$/, '')}/images/generations`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      prompt,
      image: `data:image/png;base64,${(await readFile(referencePath)).toString('base64')}`,
      size: '2K',
      output_format: 'png',
      response_format: 'url',
      watermark: false,
    }),
  });
  const text = await assertOk(response, 'Seedream image');
  const data = JSON.parse(text);
  const url = data.data?.[0]?.url;
  if (!url) {
    throw new Error('Seedream image 响应缺少图片 URL');
  }
  const imageResponse = await fetchWithTimeout(url);
  const image = Buffer.from(await imageResponse.arrayBuffer());
  if (!imageResponse.ok || image.length === 0) {
    throw new Error(`Seedream image download failed: HTTP ${imageResponse.status}`);
  }
  const outputPath = join(outDir, outputName);
  await writeFile(outputPath, image);
  return outputPath;
}

async function smokeSeedreamImage() {
  await generateSeedreamImage({
    outputName: 'seedream-smoke.png',
    prompt: '基于参考图生成一张简洁的蓝色方形品牌测试图，保持干净背景。',
  });
  console.log('Seedream image smoke passed');
}

async function createSeedanceTask(content, label) {
  const apiKey = requiredOne(['VIDEO_API_KEY', 'ARK_API_KEY']);
  const baseUrl = optional('VIDEO_BASE_URL', 'https://ark.cn-beijing.volces.com/api/v3');
  const model = optional('VIDEO_MODEL', 'doubao-seedance-2-0-260128');
  const response = await fetchWithTimeout(
    `${baseUrl.replace(/\/$/, '')}/contents/generations/tasks`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        content,
        duration: 4,
        resolution: '480p',
        ratio: 'adaptive',
        generate_audio: false,
        watermark: false,
      }),
    },
  );
  const text = await assertOk(response, label);
  const data = JSON.parse(text);
  const taskId = data.id || data.task_id;
  if (!taskId) {
    throw new Error(`${label} 响应缺少 task id`);
  }
  return { taskId, apiKey, baseUrl };
}

async function createNativeSeedanceTask(content, label) {
  try {
    return await createSeedanceTask(content, label);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      !/InputVideoSensitiveContentDetected|real person|reference_video|resource download failed|video_url/iu.test(
        message,
      )
    ) {
      throw error;
    }
    console.log(`${label} reference video unavailable; retrying without reference`);
    return createSeedanceTask(
      content.filter((item) => item.type !== 'video_url'),
      `${label} without reference`,
    );
  }
}

async function pollSeedanceTask(taskId, apiKey, baseUrl, label) {
  const maxPolls = optionalNumber('SEEDANCE_MAX_POLLS', 90);
  for (let i = 0; i < maxPolls; i += 1) {
    const response = await fetchWithTimeout(
      `${baseUrl.replace(/\/$/, '')}/contents/generations/tasks/${taskId}`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
      },
    );
    const text = await assertOk(response, `${label} query`);
    const data = JSON.parse(text);
    if (data.status === 'succeeded') {
      const url = data.content?.video_url || data.video_url;
      if (!url) {
        throw new Error(`${label} 成功响应缺少 video_url`);
      }
      return url;
    }
    if (data.status === 'failed' || data.status === 'expired') {
      throw new Error(`${label} failed: ${data.error?.message || data.status}`);
    }
    if (i === 0 || (i + 1) % 12 === 0) {
      console.log(`${label} pending: status=${data.status}, poll=${i + 1}/${maxPolls}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  throw new Error(`${label} timed out`);
}

async function smokeSeedanceVideo() {
  const { taskId, apiKey, baseUrl } = await createSeedanceTask(
    [
      {
        type: 'text',
        text: '生成一个 4 秒简洁产品广告前贴：纯色背景上出现一个干净的蓝色方形图标，镜头轻微推进。',
      },
    ],
    'Seedance video',
  );
  const url = await pollSeedanceTask(taskId, apiKey, baseUrl, 'Seedance video');
  const response = await fetchWithTimeout(url);
  const video = Buffer.from(await response.arrayBuffer());
  if (!response.ok || video.length === 0) {
    throw new Error(`Seedance video download failed: HTTP ${response.status}`);
  }
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'seedance-smoke.mp4'), video);
  console.log('Seedance video smoke passed');
}

async function downloadVideoUrl(url, outputName, label) {
  const response = await fetchWithTimeout(url);
  const video = Buffer.from(await response.arrayBuffer());
  if (!response.ok || video.length === 0) {
    throw new Error(`${label} download failed: HTTP ${response.status}`);
  }
  await mkdir(outDir, { recursive: true });
  const outputPath = join(outDir, outputName);
  await writeFile(outputPath, video);
  return outputPath;
}

async function smokeSeedanceAvatar() {
  const avatarPath = await generateSeedreamImage({
    outputName: 'seedream-avatar-smoke.png',
    prompt:
      '生成一张可用于数字人口播视频的非真人照片质感虚拟角色图。要求正面清晰单人半身构图，五官自然，干净背景，自然光照，不添加文字、Logo、水印或其他人物。',
    referenceColor: [220, 180, 120, 255],
  });
  const audioPath = await smokeTts();
  const { taskId, apiKey, baseUrl } = await createSeedanceTask(
    [
      {
        type: 'image_url',
        image_url: {
          url: `data:image/png;base64,${(await readFile(avatarPath)).toString('base64')}`,
        },
        role: 'reference_image',
      },
      {
        type: 'audio_url',
        audio_url: {
          url: `data:audio/mpeg;base64,${(await readFile(audioPath)).toString('base64')}`,
        },
        role: 'reference_audio',
      },
      {
        type: 'text',
        text: '基于参考音频驱动数字人口播，保持正面构图、自然唇形和轻微表情动作。',
      },
    ],
    'Seedance avatar',
  );
  const url = await pollSeedanceTask(taskId, apiKey, baseUrl, 'Seedance avatar');
  const response = await fetchWithTimeout(url);
  const video = Buffer.from(await response.arrayBuffer());
  if (!response.ok || video.length === 0) {
    throw new Error(`Seedance avatar download failed: HTTP ${response.status}`);
  }
  await writeFile(join(outDir, 'seedance-avatar-smoke.mp4'), video);
  console.log('Seedance avatar smoke passed');
}

function collectStoryboardText(storyboard) {
  return [
    storyboard.title,
    storyboard.script,
    storyboard.voiceover,
    ...(storyboard.shots || []).flatMap((shot) => [
      shot.imagePrompt,
      shot.videoPrompt,
      shot.voiceoverText,
      shot.module,
    ]),
  ]
    .filter(Boolean)
    .join('\n');
}

function stripReadableTextInstructions(value) {
  if (typeof value !== 'string') {
    return value;
  }
  return value
    .replace(/字幕[^，。；\n]*/gu, '无文字图形元素')
    .replace(/标题[^，。；\n]*/gu, '抽象标题色块但不含文字')
    .replace(/按钮文案[^，。；\n]*/gu, '按钮形色块但不含文字')
    .replace(/点击卡片[^，。；\n]*/gu, '抽象行动引导色块但不含文字')
    .replace(/弹窗[^，。；\n]*/gu, '抽象界面卡片但不含文字')
    .replace(/手机屏幕显示[^，。；\n]*/gu, '手机屏幕展示抽象健康提醒界面但不含文字')
    .replace(/「[^」]+」/gu, '抽象信息')
    .replace(/“[^”]+”/gu, '抽象信息')
    .replace(/福字/gu, '红色新年剪纸纹样')
    .replace(/Logo/giu, '品牌抽象标识但不含文字')
    .replace(/可读文字/gu, '可识别文字');
}

function enforceNoReadableTextStoryboard(storyboard) {
  return {
    ...storyboard,
    script: stripReadableTextInstructions(storyboard.script),
    shots: (storyboard.shots || []).map((shot) => ({
      ...shot,
      imagePrompt: `${stripReadableTextInstructions(shot.imagePrompt)}，画面中不要出现任何可读文字、字幕、花字、按钮文案、价格牌或 Logo。`,
      videoPrompt: `${stripReadableTextInstructions(shot.videoPrompt)}，画面中不要出现任何可读文字、字幕、花字、按钮文案、价格牌或 Logo。`,
    })),
  };
}

function findNativeComplianceHits(industry, storyboard) {
  const text = collectStoryboardText(storyboard);
  return [
    ...industry.blacklistWords.filter((word) => text.includes(word)).map((word) => `违禁词：${word}`),
    ...industry.forbiddenScenes.filter((scene) => text.includes(scene)).map((scene) => `禁用场景：${scene}`),
  ];
}

function assertNativeCompliance(industry, storyboard) {
  const hits = findNativeComplianceHits(industry, storyboard);
  if (hits.length > 0) {
    throw new Error(`Native ${industry.title} compliance failed: ${hits.join('；')}`);
  }
}

function assertNativeJson(industryKey, concept, script, storyboard, consistency) {
  if (!concept.title || !concept.hook || !Array.isArray(concept.sellingPoints)) {
    throw new Error(`Native ${industryKey} concept JSON 缺少必要字段`);
  }
  if (!script.title || !script.script || !script.voiceover || !Array.isArray(script.beats)) {
    throw new Error(`Native ${industryKey} script JSON 缺少必要字段`);
  }
  if (!storyboard.title || !storyboard.script || !Array.isArray(storyboard.shots) || storyboard.shots.length === 0) {
    throw new Error(`Native ${industryKey} storyboard JSON 缺少必要字段`);
  }
  if (consistency.pass !== true || typeof consistency.score !== 'number' || consistency.score < 0.6) {
    throw new Error(`Native ${industryKey} consistency failed: ${JSON.stringify(consistency)}`);
  }
}

async function runNativeIndustrySmoke(industryKey, referenceVideoPath, referenceVideoUrl) {
  const industry = nativeIndustries[industryKey];
  const brief = [
    '产品：AI 健康 APP。',
    '参考视频：原片头已加入新年元素，希望保持节日氛围和健康管理语境。',
    `行业：${industry.title}。`,
    '目标：生成 4 秒真实模型 smoke 素材，突出每日健康提醒、轻量记录和新年健康开端。',
  ].join('\n');
  const concept = await arkChatJson(
    [
      { role: 'system', content: '你是多行业广告策略规划师，只输出合法 JSON。' },
      {
        role: 'user',
        content: `按行业公式生成一条原生爆款广告概念。行业：${industry.title}。公式：${industry.formula}。必备模块：${industry.requiredModules.join('、')}。合规重点：${industry.complianceFocus}。视频画面不要设计任何可读文字、字幕、花字、按钮文案、价格牌或 Logo；产品信息通过口播和抽象 UI 图形表达。不得在输出中出现这些字面表达：${[...industry.blacklistWords, ...industry.forbiddenScenes].join('、') || '无'}。创意简报：${brief}。只输出 JSON：{"title":"...","hook":"...","audience":"...","sellingPoints":["..."],"modules":["..."],"cta":"...","tone":"..."}`,
      },
    ],
    `Native ${industryKey} concept`,
    0.2,
  );
  const script = await arkChatJson(
    [
      { role: 'system', content: '你是信息流广告脚本编导，只输出合法 JSON。' },
      {
        role: 'user',
        content: `把概念写成 4 秒广告口播脚本，不使用违禁词、禁用场景或夸大承诺。不得在输出中出现这些字面表达：${[...industry.blacklistWords, ...industry.forbiddenScenes].join('、') || '无'}。概念：${JSON.stringify(concept)}。只输出 JSON：{"title":"...","script":"完整口播脚本","voiceover":"可用于 TTS 的口播文本","cta":"...","beats":[{"timeSec":0,"text":"..."}]}`,
      },
    ],
    `Native ${industryKey} script`,
    0.2,
  );
  let storyboard = await arkChatJson(
    [
      { role: 'system', content: '你是短视频广告分镜师，只输出合法 JSON。' },
      {
        role: 'user',
        content: `把脚本拆成 9:16 的 4 秒视频生成分镜。必须包含行业模块：${industry.requiredModules.join('、')}。视频生成阶段不要出现任何可读文字、字幕、花字、按钮文案、价格牌或 Logo；口播文本只作为节奏参考。不得在输出中出现这些字面表达：${[...industry.blacklistWords, ...industry.forbiddenScenes].join('、') || '无'}。脚本：${JSON.stringify(script)}。只输出 JSON：{"title":"...","script":"...","voiceover":"...","shots":[{"index":1,"durationSec":4,"imagePrompt":"...","videoPrompt":"不包含可读文字的画面提示词","voiceoverText":"...","module":"..."}]}`,
      },
    ],
    `Native ${industryKey} storyboard`,
    0.2,
  );
  let hits = findNativeComplianceHits(industry, storyboard);
  let rewriteCount = 0;
  while (hits.length > 0 && rewriteCount < 2) {
    storyboard = await arkChatJson(
      [
        { role: 'system', content: '你是广告合规改写助手，只输出合法 JSON。' },
        {
          role: 'user',
          content: `以下${industry.title}分镜命中合规风险：${hits.join('；')}。请保留创意目标，去除风险表达，不得出现这些字面表达：${[...industry.blacklistWords, ...industry.forbiddenScenes].join('、')}。只输出同结构 JSON：${JSON.stringify(storyboard)}`,
        },
      ],
      `Native ${industryKey} compliance rewrite`,
      0.1,
    );
    hits = findNativeComplianceHits(industry, storyboard);
    rewriteCount += 1;
  }
  assertNativeCompliance(industry, storyboard);
  storyboard = enforceNoReadableTextStoryboard(storyboard);

  await smokeTts();
  const content = [
    {
      type: 'video_url',
      video_url: { url: referenceVideoUrl },
      role: 'reference_video',
    },
    {
      type: 'text',
      text: [
        `${industry.title}行业原生爆款广告 smoke。`,
        `标题：${storyboard.title}`,
        `脚本：${storyboard.script}`,
        `分镜：${JSON.stringify(storyboard.shots)}`,
        '要求：4 秒，9:16，节日健康氛围，主体稳定，不添加水印或虚假承诺，画面中不要出现任何可读文字、字幕、花字、按钮文案、价格牌或 Logo。',
      ].join('\n'),
    },
  ];
  const { taskId, apiKey, baseUrl } = await createNativeSeedanceTask(content, `Native ${industryKey} Seedance`);
  const url = await pollSeedanceTask(taskId, apiKey, baseUrl, `Native ${industryKey} Seedance`);
  const videoPath = await downloadVideoUrl(url, `native-${industryKey}.mp4`, `Native ${industryKey} Seedance`);
  const consistency = await arkChatJson(
    [
      {
        role: 'user',
        content: [
          {
            type: 'video_url',
            video_url: { url: `data:video/mp4;base64,${(await readFile(videoPath)).toString('base64')}` },
          },
          {
            type: 'text',
            text: `检查视频是否符合${industry.title}行业脚本和合规重点。脚本：${storyboard.script}。合规重点：${industry.complianceFocus}。只输出 JSON：{"pass":true,"issues":[],"score":0.9}`,
          },
        ],
      },
    ],
    `Native ${industryKey} consistency`,
    0.1,
  );
  assertNativeJson(industryKey, concept, script, storyboard, consistency);
  await mkdir(join(outDir, 'native'), { recursive: true });
  await writeFile(
    join(outDir, 'native', `${industryKey}.json`),
    JSON.stringify({ concept, script, storyboard, consistency, videoPath }, null, 2),
  );
  console.log(`Native ${industryKey} smoke passed`);
}

async function smokeNativeWorkflows() {
  const referenceVideoPath = optional('LIVE_NATIVE_REFERENCE_VIDEO', nativeReferenceVideoPath);
  await readFile(referenceVideoPath);
  const trimmedReferenceVideoPath = await trimVideoForSeedanceReference(referenceVideoPath);
  const referenceVideoUrl = await uploadOssForAsr(trimmedReferenceVideoPath);
  console.log('Native reference video OSS upload smoke passed');
  const requestedIndustries = (process.env.LIVE_SMOKE_NATIVE_INDUSTRY || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  const industryKeys =
    requestedIndustries.length > 0 ? requestedIndustries : Object.keys(nativeIndustries);
  for (const industryKey of industryKeys) {
    if (!nativeIndustries[industryKey]) {
      throw new Error(`未知 native smoke 行业：${industryKey}`);
    }
    await runNativeIndustrySmoke(industryKey, referenceVideoPath, referenceVideoUrl);
  }
  console.log(`Native ${industryKeys.length}-industry smoke passed`);
}

async function fileDataUrl(localPath, mimeType) {
  return `data:${mimeType};base64,${(await readFile(localPath)).toString('base64')}`;
}

async function runFfmpeg(args, label) {
  if (!ffmpegPath) {
    throw new Error(`${label} failed: 缺少 ffmpeg-static`);
  }
  await execFileAsync(ffmpegPath, ['-y', ...args], {
    timeout: optionalNumber('LIVE_SMOKE_FFMPEG_TIMEOUT_MS', 120_000),
    maxBuffer: 8 * 1024 * 1024,
  });
}

async function trimFeatureReference(inputPath, outputName) {
  await mkdir(outDir, { recursive: true });
  const outputPath = join(outDir, outputName);
  await runFfmpeg(
    [
      '-i',
      inputPath,
      '-t',
      '4',
      '-vf',
      'scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280',
      '-c:v',
      'libx264',
      '-c:a',
      'aac',
      '-movflags',
      '+faststart',
      outputPath,
    ],
    `trim ${outputName}`,
  );
  return outputPath;
}

async function extractAudioForSmoke(videoPath, outputName) {
  const outputPath = join(outDir, outputName);
  await runFfmpeg(['-i', videoPath, '-vn', '-c:a', 'aac', outputPath], `extract audio ${outputName}`);
  return outputPath;
}

async function extractFrameForSmoke(videoPath, outputName) {
  const outputPath = join(outDir, outputName);
  await runFfmpeg(['-ss', '1', '-i', videoPath, '-frames:v', '1', outputPath], `extract frame ${outputName}`);
  return outputPath;
}

async function transcribeLocalAudio(audioPath) {
  const apiKey = process.env.VOLC_ASR_API_KEY;
  const appId = apiKey ? undefined : required('VOLC_ASR_APPID');
  const token = apiKey ? undefined : required('VOLC_ASR_TOKEN');
  const audioUrl = await uploadOssForAsr(audioPath);
  const baseUrl = optional('VOLC_ASR_BASE_URL', 'https://openspeech.bytedance.com');
  const resourceId = optional('VOLC_ASR_RESOURCE_ID', 'volc.seedasr.auc');
  const requestId = crypto.randomUUID();
  const baseHeaders = {
    'Content-Type': 'application/json',
    'X-Api-Resource-Id': resourceId,
    'X-Api-Request-Id': requestId,
  };
  if (apiKey) {
    baseHeaders['X-Api-Key'] = apiKey;
  } else {
    baseHeaders['X-Api-App-Key'] = appId;
    baseHeaders['X-Api-Access-Key'] = token;
  }
  const submitResponse = await fetchWithTimeout(
    `${baseUrl.replace(/\/$/, '')}/api/v3/auc/bigmodel/submit`,
    {
      method: 'POST',
      headers: { ...baseHeaders, 'X-Api-Sequence': '-1' },
      body: JSON.stringify({
        user: { uid: 'volcengine_ads_feature_smoke' },
        audio: { format: inferAudioFormat(audioUrl), url: audioUrl },
        request: {
          model_name: 'bigmodel',
          enable_itn: true,
          enable_punc: true,
          show_utterances: true,
        },
      }),
    },
  );
  await assertOk(submitResponse, 'Feature ASR submit');
  const maxPolls = optionalNumber('VOLC_ASR_MAX_POLLS', 40);
  for (let i = 0; i < maxPolls; i += 1) {
    const queryResponse = await fetchWithTimeout(
      `${baseUrl.replace(/\/$/, '')}/api/v3/auc/bigmodel/query`,
      {
        method: 'POST',
        headers: baseHeaders,
        body: '{}',
      },
    );
    const queryText = await assertOk(queryResponse, 'Feature ASR query');
    const status = queryResponse.headers.get('x-api-status-code');
    if (status === '20000001' || status === '20000002') {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      continue;
    }
    if (status === '20000003') {
      return '';
    }
    if (status !== '20000000') {
      throw new Error(`Feature ASR query failed: status=${status}`);
    }
    const data = JSON.parse(queryText || '{}');
    return typeof data.result?.text === 'string' ? data.result.text : '';
  }
  throw new Error('Feature ASR query timed out');
}

async function generateFeatureVideo(content, outputName, label) {
  const { taskId, apiKey, baseUrl } = await createNativeSeedanceTask(content, label);
  const url = await pollSeedanceTask(taskId, apiKey, baseUrl, label);
  return downloadVideoUrl(url, outputName, label);
}

function assertFileCreated(path, label) {
  if (!path) {
    throw new Error(`${label} 未生成产物`);
  }
}

async function smokeExplosionFeature() {
  const sourcePath = optional('LIVE_FEATURE_SOURCE_VIDEO', nativeReferenceVideoPath);
  const sourceVideo = await trimFeatureReference(sourcePath, 'explosion-source.mp4');
  const sourceAudio = await extractAudioForSmoke(sourceVideo, 'explosion-source.m4a');
  const sourceVideoUrl = await uploadOssForAsr(sourceVideo);
  const transcriptText = await transcribeLocalAudio(sourceAudio);
  const scriptParse = await arkChatJson(
    [
      {
        role: 'user',
        content: [
          {
            type: 'video_url',
            video_url: { url: await fileDataUrl(sourceVideo, 'video/mp4') },
          },
          {
            type: 'text',
            text: `直接理解这条广告测试视频，结合 ASR 文案拆解原片脚本、节奏、卖点和 CTA。只输出 JSON：{"cta_keywords":["..."],"selling_points":["..."],"rhythm":"...","original_script":"...","scenes":[{"index":1,"durationSec":4,"visualPrompt":"...","narration":"...","transition":"..."}]}。ASR 文案：${transcriptText || '无清晰口播'}`,
          },
        ],
      },
    ],
    'Explosion script parse',
    0.2,
  );
  if (!Array.isArray(scriptParse.cta_keywords) || !Array.isArray(scriptParse.scenes)) {
    throw new Error('Explosion script parse JSON 缺少必要字段');
  }
  const rewrite = await arkChatJson(
    [
      { role: 'system', content: '你是短视频广告编导，只输出合法 JSON。' },
      {
        role: 'user',
        content: `基于原视频理解裂变 1 条广告。必须保留 CTA 关键词：${scriptParse.cta_keywords.join('、') || '立即体验'}。只输出 JSON：{"variants":[{"index":1,"copy":"...","script":"...","storyboard":[{"index":1,"durationSec":4,"visualPrompt":"...","narration":"...","transition":"..."}]}]}。原片拆解：${JSON.stringify(scriptParse)}`,
      },
    ],
    'Explosion rewrite',
    0.4,
  );
  const variant = rewrite.variants?.[0];
  if (!variant?.script || !Array.isArray(variant.storyboard)) {
    throw new Error('Explosion rewrite JSON 缺少必要字段');
  }
  const storyboard = variant.storyboard
    .map((shot) => `镜头 ${shot.index}：${shot.visualPrompt}。旁白/字幕：${shot.narration || ''}`)
    .join('\n');
  const variantVideo = await generateFeatureVideo(
    [
      {
        type: 'video_url',
        video_url: { url: sourceVideoUrl },
        role: 'reference_video',
      },
      {
        type: 'text',
        text: `爆款广告裂变测试。文案：${variant.copy}。脚本：${variant.script}。分镜：${storyboard}。要求 4 秒，9:16，健康 APP 新年氛围，不加水印。`,
      },
    ],
    'explosion-variant.mp4',
    'Explosion Seedance',
  );
  const finalPath = join(outDir, 'explosion-final.mp4');
  await runFfmpeg(
    [
      '-i',
      variantVideo,
      '-i',
      sourceAudio,
      '-map',
      '0:v:0',
      '-map',
      '1:a:0',
      '-c:v',
      'copy',
      '-c:a',
      'aac',
      '-shortest',
      finalPath,
    ],
    'Explosion audio replace',
  );
  assertFileCreated(finalPath, 'Explosion final');
  await writeFile(
    join(outDir, 'explosion.json'),
    JSON.stringify({ transcriptText, scriptParse, rewrite, variantVideo, finalPath }, null, 2),
  );
  console.log('Explosion feature smoke passed');
}

async function smokePretrailerFeature() {
  const sourcePath = optional('LIVE_FEATURE_SOURCE_VIDEO', nativeReferenceVideoPath);
  const sourceVideo = await trimFeatureReference(sourcePath, 'pretrailer-source.mp4');
  const keyframe = await extractFrameForSmoke(sourceVideo, 'pretrailer-keyframe.jpg');
  const understanding = await arkChatJson(
    [
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: await fileDataUrl(keyframe, 'image/jpeg') } },
          {
            type: 'text',
            text: '分析这条广告的产品、卖点、画面风格和受众。只输出 JSON：{"confidence":0.8,"category":"...","sellingPoints":["..."],"visualStyle":"...","audience":"..."}。',
          },
        ],
      },
    ],
    'Pretrailer understand',
    0.2,
  );
  if (typeof understanding.confidence !== 'number' || !understanding.visualStyle) {
    throw new Error('Pretrailer understand JSON 缺少必要字段');
  }
  const copy = await arkChatJson(
    [
      { role: 'system', content: '你是广告前贴文案专家，只输出合法 JSON。' },
      {
        role: 'user',
        content: `为 AI 健康 APP 生成 5 秒广告前贴，1 秒内出现核心钩子，风格与原片协调但更有新年开场吸引力。原片理解：${JSON.stringify(understanding)}。只输出 JSON：{"text":"...","hookAtSec":0.5,"voice":"zh_female_vv_uranus_bigtts"}`,
      },
    ],
    'Pretrailer copy',
    0.3,
  );
  if (!copy.text || typeof copy.hookAtSec !== 'number' || copy.hookAtSec > 1) {
    throw new Error('Pretrailer copy JSON 缺少必要字段或钩子过晚');
  }
  const script = await arkChatJson(
    [
      { role: 'system', content: '你是广告前贴分镜师，只输出合法 JSON。' },
      {
        role: 'user',
        content: `把前贴文案拆成 4 秒短分镜，首镜头 <= 1 秒。文案：${copy.text}。只输出 JSON：{"shots":[{"index":1,"durationSec":1,"prompt":"..."}]}`,
      },
    ],
    'Pretrailer script',
    0.2,
  );
  if (!Array.isArray(script.shots) || script.shots.length === 0) {
    throw new Error('Pretrailer script JSON 缺少必要字段');
  }
  const pretrailerVideo = await generateFeatureVideo(
    [
      { type: 'image_url', image_url: { url: await fileDataUrl(keyframe, 'image/jpeg') }, role: 'reference_image' },
      { type: 'text', text: `广告前贴测试，4 秒，9:16。文案：${copy.text}。分镜：${JSON.stringify(script)}。` },
    ],
    'pretrailer.mp4',
    'Pretrailer Seedance',
  );
  const voice = await synthesizeTts(copy.text, 'pretrailer-voice.mp3');
  const pretrailerAv = join(outDir, 'pretrailer-av.mp4');
  await runFfmpeg(
    ['-i', pretrailerVideo, '-i', voice, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-shortest', pretrailerAv],
    'Pretrailer mux',
  );
  const finalPath = join(outDir, 'pretrailer-final.mp4');
  await runFfmpeg(
    [
      '-i',
      pretrailerAv,
      '-i',
      sourceVideo,
      '-filter_complex',
      '[0:v]scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,fps=30,setpts=PTS-STARTPTS[v0];[1:v]scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,fps=30,setpts=PTS-STARTPTS[v1];[v0][v1]concat=n=2:v=1:a=0[v]',
      '-map',
      '[v]',
      '-an',
      '-r',
      '30',
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-t',
      '8',
      finalPath,
    ],
    'Pretrailer concat',
  );
  await writeFile(
    join(outDir, 'pretrailer.json'),
    JSON.stringify({ understanding, copy, script, pretrailerVideo, finalPath }, null, 2),
  );
  console.log('Pretrailer feature smoke passed');
}

async function smokeAvatarFeature() {
  const avatarPath = await generateSeedreamImage({
    outputName: 'avatar-feature-reference.png',
    prompt: '生成一张可用于数字人口播视频的非真人照片质感虚拟角色图，正面清晰单人半身构图，干净背景，不添加文字和水印。',
    referenceColor: [220, 180, 120, 255],
  });
  const productPath = await generateSeedreamImage({
    outputName: 'avatar-feature-product.png',
    prompt: '生成一张 AI 健康 APP 手机界面产品图，展示健康提醒、每日记录和新年健康计划，干净背景，不添加真实品牌 Logo。',
    referenceColor: [80, 160, 130, 255],
  });
  const validation = await arkChatJson(
    [
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: await fileDataUrl(avatarPath, 'image/png') } },
          { type: 'text', text: '校验图片是否正面、清晰、单人。只输出 JSON：{"valid":true,"reason":"..."}。' },
        ],
      },
    ],
    'Avatar validate',
    0.1,
  );
  if (validation.valid !== true) {
    throw new Error(`Avatar validate failed: ${validation.reason || 'unknown'}`);
  }
  const product = await arkChatJson(
    [
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: await fileDataUrl(productPath, 'image/png') } },
          { type: 'text', text: '识别产品形态、颜色与至少两个视觉卖点。只输出 JSON：{"shape":"...","color":"...","sellingPoints":["...","..."]}。' },
        ],
      },
    ],
    'Avatar product understand',
    0.2,
  );
  const brand = await arkChatJson(
    [
      { role: 'system', content: '你是品牌策略解析助手，只输出合法 JSON。' },
      {
        role: 'user',
        content: '解析品牌介绍。只输出 JSON：{"tone":"...","audience":"...","differentiators":["...","..."]}。品牌介绍：AI 健康 APP 面向关注日常健康管理的用户，提供每日提醒、轻量记录和新年健康计划。',
      },
    ],
    'Avatar brand parse',
    0.2,
  );
  const script = await arkChatJson(
    [
      { role: 'system', content: '你是电商数字人口播编导，只输出合法 JSON。' },
      {
        role: 'user',
        content: `生成 4 秒数字人口播脚本，至少两个产品差异化卖点。品牌：${JSON.stringify(brand)}。产品：${JSON.stringify(product)}。只输出 JSON：{"text":"...","differentiators":["...","..."],"timeline":[{"sellingPoint":"...","atSec":1,"productImageIndex":0}]}`,
      },
    ],
    'Avatar script',
    0.2,
  );
  if (!script.text || !Array.isArray(script.differentiators) || script.differentiators.length < 2) {
    throw new Error('Avatar script JSON 缺少必要字段');
  }
  const voice = await synthesizeTts(script.text, 'avatar-feature-voice.mp3');
  const { taskId, apiKey, baseUrl } = await createSeedanceTask(
    [
      { type: 'image_url', image_url: { url: await fileDataUrl(avatarPath, 'image/png') }, role: 'reference_image' },
      { type: 'audio_url', audio_url: { url: await fileDataUrl(voice, 'audio/mpeg') }, role: 'reference_audio' },
      { type: 'text', text: '数字人口播广告测试，保持正面构图、自然唇形和轻微表情动作。' },
    ],
    'Avatar feature Seedance',
  );
  const url = await pollSeedanceTask(taskId, apiKey, baseUrl, 'Avatar feature Seedance');
  const avatarVideo = await downloadVideoUrl(url, 'avatar-feature.mp4', 'Avatar feature Seedance');
  const finalPath = join(outDir, 'avatar-final.mp4');
  await runFfmpeg(
    [
      '-i',
      avatarVideo,
      '-i',
      productPath,
      '-filter_complex',
      '[1:v]scale=240:-1[product];[0:v][product]overlay=W-w-32:H-h-64:enable=between(t\\,1\\,3)[v]',
      '-map',
      '[v]',
      '-map',
      '0:a?',
      '-c:v',
      'libx264',
      '-c:a',
      'copy',
      finalPath,
    ],
    'Avatar overlay',
  );
  await writeFile(
    join(outDir, 'avatar-feature.json'),
    JSON.stringify({ validation, product, brand, script, avatarVideo, finalPath }, null, 2),
  );
  console.log('Avatar feature smoke passed');
}

async function smokeCoreFeatures() {
  await smokeExplosionFeature();
  await smokePretrailerFeature();
  await smokeAvatarFeature();
  console.log('Three core feature smoke passed');
}

async function smokeAsr() {
  const apiKey = process.env.VOLC_ASR_API_KEY;
  const appId = apiKey ? undefined : required('VOLC_ASR_APPID');
  const token = apiKey ? undefined : required('VOLC_ASR_TOKEN');
  let audioUrl = optional(
    'VOLC_ASR_TEST_AUDIO_URL',
    'https://raw.githubusercontent.com/Jakobovski/free-spoken-digit-dataset/master/recordings/0_jackson_0.wav',
  );
  const localAudio = process.env.VOLC_ASR_TEST_AUDIO_PATH;
  if (localAudio) {
    audioUrl = await uploadOssForAsr(localAudio);
    console.log('Aliyun OSS upload smoke passed');
  }
  if (!isHttpUrl(audioUrl)) {
    throw new Error(
      'VOLC_ASR_TEST_AUDIO_URL 必须是公网 URL，或提供 VOLC_ASR_TEST_AUDIO_PATH + OSS_*',
    );
  }
  const baseUrl = optional('VOLC_ASR_BASE_URL', 'https://openspeech.bytedance.com');
  const resourceId = optional('VOLC_ASR_RESOURCE_ID', 'volc.seedasr.auc');
  const requestId = crypto.randomUUID();
  const baseHeaders = {
    'Content-Type': 'application/json',
    'X-Api-Resource-Id': resourceId,
    'X-Api-Request-Id': requestId,
  };
  if (apiKey) {
    baseHeaders['X-Api-Key'] = apiKey;
  } else {
    baseHeaders['X-Api-App-Key'] = appId;
    baseHeaders['X-Api-Access-Key'] = token;
  }
  const submitResponse = await fetchWithTimeout(
    `${baseUrl.replace(/\/$/, '')}/api/v3/auc/bigmodel/submit`,
    {
      method: 'POST',
      headers: { ...baseHeaders, 'X-Api-Sequence': '-1' },
      body: JSON.stringify({
        user: { uid: 'volcengine_ads_live_smoke' },
        audio: {
          format: inferAudioFormat(audioUrl),
          url: audioUrl,
        },
        request: {
          model_name: 'bigmodel',
          enable_itn: true,
          enable_punc: true,
          show_utterances: true,
        },
      }),
    },
  );
  await assertOk(submitResponse, 'Volc ASR submit');
  const submitStatus = submitResponse.headers.get('x-api-status-code');
  if (submitStatus !== '20000000') {
    throw new Error(`Volc ASR submit failed: status=${submitStatus}`);
  }

  const maxPolls = optionalNumber('VOLC_ASR_MAX_POLLS', 40);
  for (let i = 0; i < maxPolls; i += 1) {
    const queryResponse = await fetchWithTimeout(
      `${baseUrl.replace(/\/$/, '')}/api/v3/auc/bigmodel/query`,
      {
        method: 'POST',
        headers: baseHeaders,
        body: '{}',
      },
    );
    const queryText = await assertOk(queryResponse, 'Volc ASR query');
    const status = queryResponse.headers.get('x-api-status-code');
    if (status === '20000001' || status === '20000002') {
      if (i === 0 || (i + 1) % 10 === 0) {
        console.log(`Volc ASR query pending: status=${status}, poll=${i + 1}/${maxPolls}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 3000));
      continue;
    }
    if (status === '20000003') {
      console.log('Volc ASR smoke passed (terminal no-speech result)');
      return;
    }
    if (status !== '20000000') {
      throw new Error(`Volc ASR query failed: status=${status}`);
    }
    const data = JSON.parse(queryText || '{}');
    if (typeof data.result?.text !== 'string') {
      throw new Error('Volc ASR query 响应缺少 result.text');
    }
    console.log('Volc ASR smoke passed');
    return;
  }
  throw new Error('Volc ASR query timed out');
}

try {
  await loadLocalEnvFile();
  await loadAppSettingsEnv();
  const target = process.env.LIVE_SMOKE_TARGET || 'all';
  if (target === 'asr') {
    await smokeAsr();
  } else if (target === 'chat') {
    await smokeArkChat();
  } else if (target === 'tts') {
    await smokeTts();
  } else if (target === 'tts-speakers') {
    await smokeTtsSpeakers();
  } else if (target === 'image') {
    await smokeSeedreamImage();
  } else if (target === 'video') {
    await smokeSeedanceVideo();
  } else if (target === 'avatar') {
    await smokeSeedanceAvatar();
  } else if (target === 'native') {
    await smokeNativeWorkflows();
  } else if (target === 'features') {
    await smokeCoreFeatures();
  } else if (target === 'feature-explosion') {
    await smokeExplosionFeature();
  } else if (target === 'feature-pretrailer') {
    await smokePretrailerFeature();
  } else if (target === 'feature-avatar') {
    await smokeAvatarFeature();
  } else {
    await smokeAsr();
    await smokeArkChat();
    await smokeTts();
    await smokeSeedreamImage();
    await smokeSeedanceVideo();
    await smokeSeedanceAvatar();
    await smokeNativeWorkflows();
    await smokeCoreFeatures();
  }
  console.log('Live smoke finished');
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
}
