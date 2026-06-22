import { existsSync } from 'node:fs';
import { copyFile, mkdir } from 'node:fs/promises';
import { basename, dirname, extname, resolve } from 'node:path';

import { generatePlaceholderImage } from '../media/ffmpeg.js';
import type { ImageResult, ModelClient } from './index.js';

const STYLE_PALETTES = {
  clean: { bg: '#f8fafc', fg: '#0f172a', accent: '#0ea5e9' },
  premium: { bg: '#1c1917', fg: '#f5f5f4', accent: '#d97706' },
  promotion: { bg: '#fef2f2', fg: '#7f1d1d', accent: '#ef4444' },
  lifestyle: { bg: '#f0fdf4', fg: '#14532d', accent: '#16a34a' },
  default: { bg: '#f4ede2', fg: '#1c1917', accent: '#e0583a' },
} as const;

type Palette = (typeof STYLE_PALETTES)[keyof typeof STYLE_PALETTES];

function pickPalette(prompt: string): Palette {
  const lower = prompt.toLowerCase();
  if (/premium|luxur|dark|高级|暗调|氛围/.test(lower)) {
    return STYLE_PALETTES.premium;
  }
  if (/promotion|sales|优惠|热卖|促销/.test(lower)) {
    return STYLE_PALETTES.promotion;
  }
  if (/lifestyle|life|生活|自然光|场景/.test(lower)) {
    return STYLE_PALETTES.lifestyle;
  }
  if (/clean|minimal|clean|棚拍|白底|极简/.test(lower)) {
    return STYLE_PALETTES.clean;
  }
  return STYLE_PALETTES.default;
}

function deriveBadges(prompt: string): string[] {
  const tags: string[] = [];
  const lower = prompt.toLowerCase();
  if (/限时|limited|促销|sales/.test(lower)) tags.push('限时优惠');
  if (/新品|new|新款/.test(lower)) tags.push('新品');
  if (/hot|热卖|爆款/.test(lower)) tags.push('热卖中');
  if (/包邮|free shipping/.test(lower)) tags.push('包邮');
  if (/品质|quality|精选/.test(lower)) tags.push('精选品质');
  if (tags.length === 0) tags.push('DEMO 演示');
  return tags.slice(0, 3);
}

function deriveMainText(prompt: string): string {
  const trimmed = prompt
    .replace(/^生成.*?(?=商品|产品|图片|背景)/u, '')
    .replace(/[，。；、\s]+/gu, ' ')
    .trim();
  if (trimmed.length === 0) return '商品包装图';
  const words = trimmed.split(/\s+/u);
  return words.slice(0, 3).join(' ').slice(0, 24);
}

function deriveSubText(prompt: string): string {
  if (/white|白底|干净|简约/.test(prompt.toLowerCase())) return '干净简约 · 聚焦产品';
  return '本地生成演示图 · 无云端依赖';
}

export interface LocalMockModelClientOptions {
  variantLabel?: string;
  seed?: number;
}

export class LocalMockModelClient implements ModelClient {
  private readonly variantLabel: string;
  private readonly seed: number;

  constructor(options: LocalMockModelClientOptions = {}) {
    this.variantLabel = options.variantLabel ?? 'demo';
    this.seed = options.seed ?? 1;
  }

  async generateImage(req: {
    refImagePath: string;
    prompt: string;
    outputPath: string;
    size?: string;
  }): Promise<ImageResult> {
    await mkdir(dirname(req.outputPath), { recursive: true });

    if (existsSync(req.refImagePath)) {
      const ext = extname(req.refImagePath).toLowerCase();
      if (ext === '.png' || ext === '.jpg' || ext === '.jpeg') {
        await copyFile(req.refImagePath, req.outputPath);
        return { localPath: req.outputPath };
      }
    }

    const palette = pickPalette(req.prompt);
    const parsed = (req.size ?? '1024x1024').toLowerCase().split('x');
    const width = Number(parsed[0]);
    const height = Number(parsed[1]);
    await generatePlaceholderImage(req.outputPath, {
      width: Number.isFinite(width) && width > 0 ? width : 1024,
      height: Number.isFinite(height) && height > 0 ? height : 1024,
      backgroundColor: palette.bg,
      foregroundColor: palette.fg,
      accentColor: palette.accent,
      mainText: deriveMainText(req.prompt) || `VARIANT ${this.variantLabel}`,
      subText: deriveSubText(req.prompt),
      badgeText: deriveBadges(req.prompt).join(' · '),
    });
    return { localPath: req.outputPath };
  }

  async generateVideo(): Promise<never> {
    throw new Error('LocalMockModelClient.generateVideo 未实现');
  }

  async generateDigitalHuman(): Promise<never> {
    throw new Error('LocalMockModelClient.generateDigitalHuman 未实现');
  }

  async asr(): Promise<never> {
    throw new Error('LocalMockModelClient.asr 未实现');
  }

  async tts(): Promise<never> {
    throw new Error('LocalMockModelClient.tts 未实现');
  }

  async chat(messages: unknown, opts?: { readonly jsonSchema?: object }): Promise<string> {
    const _messages = Array.isArray(messages) ? (messages as Array<Record<string, unknown>>) : [];
    const userText = _messages
      .filter((m) => m.role === 'user')
      .map((m) => (typeof m.content === 'string' ? m.content : ''))
      .join('\n')
      .trim();

    if (/copy|文案|短卖点|卖点|标题|副标题|徽标|badges|keywords|词性|noun|adjective/i.test(userText)) {
      return JSON.stringify({
        headline: '草本纯净洗发露 · 温和低刺激',
        subHeadline: '24 小时控油 · 蓬松去油 · 大容量性价比高',
        badges: ['新品上市', '限时 8 折', '包邮到家'],
        keywords: [
          { text: '洗发水', partOfSpeech: 'noun', emphasis: 'high' },
          { text: '草本', partOfSpeech: 'adjective', emphasis: 'medium' },
          { text: '控油蓬松', partOfSpeech: 'adjective', emphasis: 'high' },
          { text: '温和', partOfSpeech: 'adjective', emphasis: 'medium' },
          { text: '大容量', partOfSpeech: 'noun', emphasis: 'medium' },
        ],
        styleHints: ['italic', 'stroke', 'border', 'top_bottom_border', 'background'],
        colorStrategy: '与背景保持同色系，选取最深颜色为主文字颜色',
        riskControl: '避免使用医疗和绝对化词语',
      });
    }

    if (/商品理解|product|主体|牛皮癣|背景问题|噪点|卖点|品类/i.test(userText)) {
    return JSON.stringify({
      productName: '草本纯净洗发露',
      category: '个护清洁 / 洗发水',
      visualFeatures: ['白色背景', '产品主体居中', '文字标题'],
      suspectedTextNoise: ['DEMO-WATERMARK'],
      backgroundIssues: ['整体简单干净，无严重干扰'],
      sellingPoints: ['温和配方', '24 小时控油', '大容量性价比高'],
      recommendedStyle: 'clean',
    });
  }

    return JSON.stringify({
      message: '这是本地演示脚本返回的默认回答',
      seed: this.seed,
    });
  }

  async webSearch(): Promise<never> {
    throw new Error('LocalMockModelClient.webSearch 未实现');
  }

  async vision(
    images: string[],
    prompt: string,
    opts?: {
      readonly jsonSchema?: object;
    },
  ): Promise<string> {
    if (/product_understand|商品理解|商品图|电商商品|视觉分析|ecommerce|visual|商品主体|品类/i.test(prompt)) {
      return JSON.stringify({
        productName: '草本纯净洗发露',
        category: '个护清洁 / 洗发水',
        visualFeatures: ['白色背景', '产品主体居中', '画面简洁'],
        suspectedTextNoise: ['DEMO-WATERMARK'],
        backgroundIssues: ['整体简单干净，无严重干扰'],
        sellingPoints: ['温和配方', '24 小时控油', '大容量性价比高'],
        recommendedStyle: 'clean',
      });
    }
    return this.chat([{ role: 'user', content: `基于图片分析：${images.join(' / ')} ${prompt}` }], opts);
  }

  async visionVideo(
    _videoPath: string,
    prompt: string,
    _opts?: {
      readonly jsonSchema?: object;
    },
  ): Promise<string> {
    return this.chat([{ role: 'user', content: prompt }], _opts);
  }
}

export function makeLocalMockModelClient(options?: LocalMockModelClientOptions): LocalMockModelClient {
  return new LocalMockModelClient(options);
}

export function resolveLocalMockArtifactPath(artifactDir: string, filename: string): string {
  return resolve(artifactDir, basename(filename));
}
