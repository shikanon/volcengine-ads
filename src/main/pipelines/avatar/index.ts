import { copyFile } from 'node:fs/promises';

import { AppError } from '../../errors.js';
import { overlayProductImages } from '../../media/ffmpeg.js';
import type { AvatarInput } from '../../../shared/types.js';
import { artifactPath, parseModelJson, readJson, workflowPrompt, writeJson } from '../helpers.js';
import type { PipelineDefinition, StepContext } from '../types.js';

interface AvatarValidation {
  valid: boolean;
  reason: string;
}

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
  const avatarReferencePath = artifactPath(ctx.artifactDir, 'avatar_reference.png');
  const response = await ctx.modelClient.vision(
    [ctx.input.avatarImagePath],
    workflowPrompt(ctx, 'avatar.validate_avatar'),
  );
  const validation = parseModelJson<AvatarValidation>(response, '数字人图片校验');
  if (!validation.valid) {
    throw new AppError('E_AVATAR_INVALID', validation.reason);
  }
  await writeJson(artifactPath(ctx.artifactDir, 'validate.json'), validation);
  const generated = await ctx.modelClient.generateImage({
    refImagePath: ctx.input.avatarImagePath,
    prompt: workflowPrompt(ctx, 'avatar.image_generation'),
    outputPath: avatarReferencePath,
    size: '2K',
  });
  return { artifactPath: generated.localPath };
}

async function runProductUnderstand(ctx: StepContext<AvatarInput>) {
  const response = await ctx.modelClient.vision(
    ctx.input.productImagePaths,
    workflowPrompt(ctx, 'avatar.product_understand'),
  );
  const product = parseModelJson<ProductUnderstanding>(response, '产品图理解');
  if (!product.shape || !product.color || !Array.isArray(product.sellingPoints)) {
    throw new AppError('E_MODEL_API_FAILED', '产品图理解缺少必要字段');
  }
  return { artifactPath: await writeJson(artifactPath(ctx.artifactDir, 'product.json'), product) };
}

async function runBrandParse(ctx: StepContext<AvatarInput>) {
  const response = await ctx.modelClient.chat([
    {
      role: 'system',
      content: '你是品牌策略解析助手，只输出合法 JSON。',
    },
    {
      role: 'user',
      content: workflowPrompt(ctx, 'avatar.brand_parse', { brandIntro: ctx.input.brandIntro }),
    },
  ]);
  const brand = parseModelJson<BrandParse>(response, '品牌解析');
  if (!brand.tone || !brand.audience || !Array.isArray(brand.differentiators)) {
    throw new AppError('E_MODEL_API_FAILED', '品牌解析缺少必要字段');
  }
  return { artifactPath: await writeJson(artifactPath(ctx.artifactDir, 'brand.json'), brand) };
}

async function runScriptGen(ctx: StepContext<AvatarInput>) {
  const brand = await readJson<BrandParse>(artifactPath(ctx.artifactDir, 'brand.json'));
  const product = await readJson<ProductUnderstanding>(
    artifactPath(ctx.artifactDir, 'product.json'),
  );
  const response = await ctx.modelClient.chat([
    {
      role: 'system',
      content:
        '你是电商数字人口播编导。只输出 JSON：{"text":"...","differentiators":["...","..."],"timeline":[{"sellingPoint":"...","atSec":4,"productImageIndex":0}]}。',
    },
    {
      role: 'user',
      content: workflowPrompt(ctx, 'avatar.script_gen', {
        duration: ctx.input.duration,
        brandJson: JSON.stringify(brand),
        productJson: JSON.stringify(product),
        productImageCount: ctx.input.productImagePaths.length,
      }),
    },
  ]);
  const script = parseModelJson<AvatarScript>(response, '数字人口播脚本');
  if (!script.text || !Array.isArray(script.differentiators) || script.differentiators.length < 2) {
    throw new AppError('E_INPUT_VALIDATION', '口播文案至少需要 2 个产品差异化卖点');
  }
  if (!Array.isArray(script.timeline)) {
    throw new AppError('E_MODEL_API_FAILED', '数字人口播脚本缺少时间轴');
  }
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
    avatarImagePath: artifactPath(ctx.artifactDir, 'avatar_reference.png'),
    prompt: workflowPrompt(ctx, 'avatar.seedance_avatar'),
    durationSec: ctx.input.duration,
    outputPath: artifactPath(ctx.artifactDir, 'avatar.mp4'),
  });
  if (result.lipSyncOffsetMs !== undefined && result.lipSyncOffsetMs > 80) {
    return {
      artifactPath: result.localPath,
      logs: `唇形同步偏差 ${result.lipSyncOffsetMs}ms，已记录告警`,
    };
  }
  return { artifactPath: result.localPath };
}

async function runOverlay(ctx: StepContext<AvatarInput>) {
  const finalPath = artifactPath(ctx.artifactDir, 'final.mp4');
  await overlayProductImages(
    artifactPath(ctx.artifactDir, 'avatar.mp4'),
    ctx.input.productImagePaths,
    finalPath,
  );
  return { artifactPath: finalPath };
}

async function runPostprocess(ctx: StepContext<AvatarInput>) {
  const finalPath = artifactPath(ctx.artifactDir, 'final.mp4');
  ctx.repository.createAsset({
    taskId: ctx.task.id,
    kind: 'video',
    path: finalPath,
    tags: ['avatar'],
  });
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
