import { copyFile } from 'node:fs/promises';

import { AppError } from '../../errors.js';
import { overlayProductImages } from '../../media/ffmpeg.js';
import type { AvatarInput } from '../../../shared/types.js';
import { artifactPath, readJson, writeJson } from '../helpers.js';
import type { PipelineDefinition, StepContext } from '../types.js';

interface BrandParse {
  tone: string;
  audience: string;
  differentiators: string[];
}

interface ProductUnderstanding {
  shape: string;
  color: string;
  sellingPoints: string[];
}

interface AvatarScript {
  text: string;
  differentiators: string[];
  timeline: Array<{ sellingPoint: string; atSec: number; productImageIndex: number }>;
}

async function runValidateAvatar(ctx: StepContext<AvatarInput>) {
  const response = await ctx.modelClient.vision(
    [ctx.input.avatarImagePath],
    '校验图片是否正面、清晰、单人。输出 JSON：valid:boolean, reason:string。',
  );
  if (response.toLowerCase().includes('"valid":false')) {
    throw new AppError('E_AVATAR_INVALID');
  }
  return { artifactPath: await writeJson(artifactPath(ctx.artifactDir, 'validate.json'), { valid: true }) };
}

async function runProductUnderstand(ctx: StepContext<AvatarInput>) {
  const response = await ctx.modelClient.vision(
    ctx.input.productImagePaths,
    '识别产品形态、颜色与至少两个视觉卖点，输出结构化摘要。',
  );
  const product: ProductUnderstanding = {
    shape: 'product',
    color: 'auto',
    sellingPoints: [response, '视觉呈现清晰'],
  };
  return { artifactPath: await writeJson(artifactPath(ctx.artifactDir, 'product.json'), product) };
}

async function runBrandParse(ctx: StepContext<AvatarInput>) {
  const response = await ctx.modelClient.chat([
    { role: 'system', content: '解析品牌介绍，输出调性、人群、差异化点 JSON。' },
    { role: 'user', content: ctx.input.brandIntro },
  ]);
  const brand: BrandParse = {
    tone: response,
    audience: '目标消费人群',
    differentiators: ['品牌调性明确', '产品表达聚焦'],
  };
  return { artifactPath: await writeJson(artifactPath(ctx.artifactDir, 'brand.json'), brand) };
}

async function runScriptGen(ctx: StepContext<AvatarInput>) {
  const brand = await readJson<BrandParse>(artifactPath(ctx.artifactDir, 'brand.json'));
  const product = await readJson<ProductUnderstanding>(artifactPath(ctx.artifactDir, 'product.json'));
  const differentiators = [...brand.differentiators, ...product.sellingPoints].slice(0, 2);
  if (differentiators.length < 2) {
    throw new AppError('E_INPUT_VALIDATION', '口播文案至少需要 2 个产品差异化卖点');
  }
  const script: AvatarScript = {
    text: `开场钩子：介绍品牌价值。卖点一：${differentiators[0]}。卖点二：${differentiators[1]}。立即了解更多。`,
    differentiators,
    timeline: differentiators.map((sellingPoint, index) => ({
      sellingPoint,
      atSec: Math.min(ctx.input.duration - 2, 4 + index * 8),
      productImageIndex: Math.min(index, ctx.input.productImagePaths.length - 1),
    })),
  };
  return { artifactPath: await writeJson(artifactPath(ctx.artifactDir, 'script.json'), script) };
}

async function runTts(ctx: StepContext<AvatarInput>) {
  const script = await readJson<AvatarScript>(artifactPath(ctx.artifactDir, 'script.json'));
  const audio = await ctx.modelClient.tts(script.text, 'zh_female_vv_uranus_bigtts');
  await copyFile(audio.localPath, artifactPath(ctx.artifactDir, 'voice.m4a'));
  return { artifactPath: artifactPath(ctx.artifactDir, 'voice.m4a') };
}

async function runSeedanceAvatar(ctx: StepContext<AvatarInput>) {
  const result = await ctx.modelClient.generateDigitalHuman({
    audioPath: artifactPath(ctx.artifactDir, 'voice.m4a'),
    avatarImagePath: ctx.input.avatarImagePath,
    durationSec: ctx.input.duration,
    outputPath: artifactPath(ctx.artifactDir, 'avatar.mp4'),
  });
  if (result.lipSyncOffsetMs !== undefined && result.lipSyncOffsetMs > 80) {
    return { artifactPath: result.localPath, logs: `唇形同步偏差 ${result.lipSyncOffsetMs}ms，已记录告警` };
  }
  return { artifactPath: result.localPath };
}

async function runOverlay(ctx: StepContext<AvatarInput>) {
  const finalPath = artifactPath(ctx.artifactDir, 'final.mp4');
  await overlayProductImages(artifactPath(ctx.artifactDir, 'avatar.mp4'), finalPath);
  return { artifactPath: finalPath };
}

async function runPostprocess(ctx: StepContext<AvatarInput>) {
  const finalPath = artifactPath(ctx.artifactDir, 'final.mp4');
  ctx.repository.createAsset({ taskId: ctx.task.id, kind: 'video', path: finalPath, tags: ['avatar'] });
  return { artifactPath: finalPath };
}

export const avatarPipeline: PipelineDefinition<AvatarInput> = {
  type: 'avatar',
  steps: [
    { name: 'validate_avatar', runStep: runValidateAvatar },
    { name: 'product_understand', runStep: runProductUnderstand },
    { name: 'brand_parse', runStep: runBrandParse },
    { name: 'script_gen', runStep: runScriptGen },
    { name: 'tts', runStep: runTts },
    { name: 'seedance_avatar', runStep: runSeedanceAvatar },
    { name: 'overlay', runStep: runOverlay },
    { name: 'postprocess', runStep: runPostprocess },
  ],
};
