import { existsSync } from 'node:fs';
import { extname, isAbsolute } from 'node:path';

import { AppError } from './errors.js';
import { parseLarkDocumentUrl } from './services/lark-download-helpers.js';
import {
  VIDEO_SCORING_CATEGORY_DEFINITIONS,
  DEFAULT_VIDEO_RESOLUTION,
  COPYWRITING_SCRIPT_FORMAT_DEFINITIONS,
  PRETRAILER_VIDEO_TYPE_DEFINITIONS,
  VIDEO_RESOLUTION_OPTIONS,
  normalizePretrailerStyle,
} from '../shared/types.js';
import {
  FISSION_INDUSTRY_OPTIONS,
  FISSION_MODE_DEFINITIONS,
  FISSION_MODE_VALUES,
  FISSION_SLOT_DEFINITIONS,
  FISSION_SLOT_KEYS,
  validateFissionCombinationInputs,
} from '../shared/workflows.js';
import type {
  AvatarInput,
  CopywritingIndustry,
  CopywritingInput,
  CopywritingScriptFormat,
  EcommerceImageInput,
  EcommerceImageStyle,
  CreateTaskRequest,
  ExplosionFissionConfig,
  ExplosionFissionMode,
  ExplosionInput,
  FissionIndustry,
  LarkDownloadInput,
  NativeIndustry,
  NativeInput,
  NativeRatio,
  PretrailerInput,
  VideoScoringInput,
  VideoResolution,
} from '../shared/types.js';

const NATIVE_INDUSTRIES: readonly NativeIndustry[] = [
  'game',
  'short_drama',
  'novel',
  'social',
  'tool',
  'ecommerce',
  'money_making',
];
const NATIVE_RATIOS: readonly NativeRatio[] = ['9:16', '16:9', '1:1'];
const COPYWRITING_FORMATS: readonly CopywritingScriptFormat[] =
  COPYWRITING_SCRIPT_FORMAT_DEFINITIONS.map((definition) => definition.value);
const COPYWRITING_INDUSTRIES: readonly CopywritingIndustry[] = ['auto', ...NATIVE_INDUSTRIES];
const VIDEO_SCORING_CATEGORIES = VIDEO_SCORING_CATEGORY_DEFINITIONS.map((definition) => definition.value);
const ECOMMERCE_IMAGE_STYLES: readonly EcommerceImageStyle[] = [
  'clean',
  'premium',
  'promotion',
  'lifestyle',
];
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.bmp']);
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new AppError('E_INPUT_VALIDATION', `${field} 不能为空`);
  }
  return value.trim();
}

function requireNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new AppError('E_INPUT_VALIDATION', `${field} 必须是数字`);
  }
  return value;
}

function normalizeVideoResolution(value: unknown): VideoResolution {
  if (value === undefined || value === null || value === '') {
    return DEFAULT_VIDEO_RESOLUTION;
  }
  if (
    typeof value === 'string' &&
    VIDEO_RESOLUTION_OPTIONS.some((option) => option.value === value)
  ) {
    return value as VideoResolution;
  }
  throw new AppError('E_INPUT_VALIDATION', '视频分辨率只支持 480P、720P、1080P');
}

function validatePathList(value: unknown, field: string): string[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new AppError('E_INPUT_VALIDATION', `${field} 必须是文件路径数组`);
  }
  return value.map((item, index) => {
    const path = requireString(item, `${field} ${index + 1}`);
    if (!existsSync(path)) {
      throw new AppError('E_INPUT_VALIDATION', `${field} 不存在：${path}`);
    }
    return path;
  });
}

function validateExplosionFissionConfig(
  value: unknown,
  variantCount: number,
): ExplosionFissionConfig | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!isRecord(value)) {
    throw new AppError('E_INPUT_VALIDATION', '行业裂变配置格式错误');
  }
  const industry = value.industry;
  if (
    typeof industry !== 'string' ||
    !FISSION_INDUSTRY_OPTIONS.includes(industry as FissionIndustry)
  ) {
    throw new AppError('E_INPUT_VALIDATION', '行业裂变只支持电商和短剧');
  }
  const mode = value.mode;
  if (typeof mode !== 'string' || !FISSION_MODE_VALUES.includes(mode as ExplosionFissionMode)) {
    throw new AppError('E_INPUT_VALIDATION', '行业裂变模式不支持');
  }
  if (FISSION_MODE_DEFINITIONS[mode as ExplosionFissionMode].industry !== industry) {
    throw new AppError('E_INPUT_VALIDATION', '行业裂变模式与所选行业不匹配');
  }

  const slotAssetPaths: ExplosionFissionConfig['slotAssetPaths'] = {};
  if (value.slotAssetPaths !== undefined && value.slotAssetPaths !== null) {
    if (!isRecord(value.slotAssetPaths)) {
      throw new AppError('E_INPUT_VALIDATION', '行业裂变槽位素材格式错误');
    }
    for (const slotKey of FISSION_SLOT_KEYS) {
      const paths = validatePathList(
        value.slotAssetPaths[slotKey],
        FISSION_SLOT_DEFINITIONS[slotKey].label,
      );
      if (paths.length > 0) {
        slotAssetPaths[slotKey] = paths;
      }
    }
  }

  const bgmPaths = validatePathList(value.bgmPaths, 'BGM');
  const config: ExplosionFissionConfig = {
    industry: industry as FissionIndustry,
    mode: mode as ExplosionFissionMode,
  };
  if (Object.keys(slotAssetPaths).length > 0) {
    config.slotAssetPaths = slotAssetPaths;
  }
  if (bgmPaths.length > 0) {
    config.bgmPaths = bgmPaths;
  }

  const result = validateFissionCombinationInputs(config, variantCount);
  if (!result.valid) {
    throw new AppError('E_INPUT_VALIDATION', result.errors.join('；'));
  }
  return config;
}

function validateExplosion(input: unknown): ExplosionInput {
  if (!isRecord(input)) {
    throw new AppError('E_INPUT_VALIDATION', '爆款裂变输入格式错误');
  }
  const douyinUrl = typeof input.douyinUrl === 'string' ? input.douyinUrl.trim() : '';
  const sourceVideoPath =
    typeof input.sourceVideoPath === 'string' ? input.sourceVideoPath.trim() : '';
  if (
    (douyinUrl.length > 0 && sourceVideoPath.length > 0) ||
    (douyinUrl.length === 0 && sourceVideoPath.length === 0)
  ) {
    throw new AppError('E_INPUT_VALIDATION', '抖音链接和本地视频必须二选一');
  }
  if (sourceVideoPath.length > 0 && !existsSync(sourceVideoPath)) {
    throw new AppError('E_INPUT_VALIDATION', '本地视频不存在');
  }
  const variantCount = Math.trunc(requireNumber(input.variantCount ?? 3, '裂变数量'));
  if (variantCount < 1 || variantCount > 10) {
    throw new AppError('E_INPUT_VALIDATION', '裂变数量必须在 1..10');
  }
  const resolution = normalizeVideoResolution(input.resolution);
  const fissionConfig = validateExplosionFissionConfig(input.fissionConfig, variantCount);
  const output: ExplosionInput =
    sourceVideoPath.length > 0
      ? { sourceVideoPath, variantCount, resolution }
      : { douyinUrl, variantCount, resolution };
  if (fissionConfig) {
    output.fissionConfig = fissionConfig;
  }
  return output;
}

function validatePretrailer(input: unknown): PretrailerInput {
  if (!isRecord(input)) {
    throw new AppError('E_INPUT_VALIDATION', '广告前贴输入格式错误');
  }
  const sourceVideoPath = requireString(input.sourceVideoPath, '原广告视频');
  if (!existsSync(sourceVideoPath)) {
    throw new AppError('E_INPUT_VALIDATION', '原广告视频不存在');
  }
  const pretrailerDuration = Math.trunc(requireNumber(input.pretrailerDuration ?? 7, '前贴时长'));
  if (pretrailerDuration < 5 || pretrailerDuration > 10) {
    throw new AppError('E_INPUT_VALIDATION', '前贴时长必须在 5..10 秒');
  }
  const style = input.style;
  if (
    typeof style !== 'string' ||
    !PRETRAILER_VIDEO_TYPE_DEFINITIONS.some((definition) => definition.value === style)
  ) {
    throw new AppError('E_INPUT_VALIDATION', '广告前贴视频生成类型不支持');
  }
  return {
    sourceVideoPath,
    pretrailerDuration,
    style: normalizePretrailerStyle(style),
    resolution: normalizeVideoResolution(input.resolution),
  };
}

function validateAvatar(input: unknown): AvatarInput {
  if (!isRecord(input)) {
    throw new AppError('E_INPUT_VALIDATION', '数字人口播输入格式错误');
  }
  const avatarImagePath = requireString(input.avatarImagePath, '数字人图片');
  if (!existsSync(avatarImagePath)) {
    throw new AppError('E_INPUT_VALIDATION', '数字人图片不存在');
  }
  const brandIntro = requireString(input.brandIntro, '品牌介绍');
  if (brandIntro.length < 20 || brandIntro.length > 1000) {
    throw new AppError('E_INPUT_VALIDATION', '品牌介绍建议 100..500 字，当前需在 20..1000 字');
  }
  const rawProductImages = input.productImagePaths;
  if (
    !Array.isArray(rawProductImages) ||
    rawProductImages.length < 1 ||
    rawProductImages.length > 3
  ) {
    throw new AppError('E_INPUT_VALIDATION', '产品图需上传 1..3 张');
  }
  const productImagePaths = rawProductImages.map((item, index) =>
    requireString(item, `产品图 ${index + 1}`),
  );
  for (const path of productImagePaths) {
    if (!existsSync(path)) {
      throw new AppError('E_INPUT_VALIDATION', `产品图不存在：${path}`);
    }
  }
  const duration = Math.trunc(requireNumber(input.duration ?? 30, '视频时长'));
  if (duration < 15 || duration > 60) {
    throw new AppError('E_INPUT_VALIDATION', '视频时长必须在 15..60 秒');
  }
  return {
    avatarImagePath,
    brandIntro,
    productImagePaths,
    duration,
    resolution: normalizeVideoResolution(input.resolution),
  };
}

function validateNative(input: unknown): NativeInput {
  if (!isRecord(input)) {
    throw new AppError('E_INPUT_VALIDATION', '原生输入格式错误');
  }
  const industry = input.industry;
  if (typeof industry !== 'string' || !NATIVE_INDUSTRIES.includes(industry as NativeIndustry)) {
    throw new AppError('E_INPUT_VALIDATION', '原生行业不支持');
  }
  const brief = requireString(input.brief, '广告文案脚本');
  if (brief.length < 10 || brief.length > 2000) {
    throw new AppError('E_INPUT_VALIDATION', '广告文案脚本需在 10..2000 字');
  }
  const productName =
    typeof input.productName === 'string' && input.productName.trim().length > 0
      ? input.productName.trim()
      : undefined;
  if (productName !== undefined && productName.length > 80) {
    throw new AppError('E_INPUT_VALIDATION', '产品名称不能超过 80 字');
  }
  const referenceVideoPath =
    typeof input.referenceVideoPath === 'string' && input.referenceVideoPath.trim().length > 0
      ? input.referenceVideoPath.trim()
      : undefined;
  if (referenceVideoPath !== undefined && !existsSync(referenceVideoPath)) {
    throw new AppError('E_INPUT_VALIDATION', '参考视频不存在');
  }
  let referenceImagePaths: string[] | undefined;
  if (input.referenceImagePaths !== undefined) {
    if (!Array.isArray(input.referenceImagePaths)) {
      throw new AppError('E_INPUT_VALIDATION', '参考图片格式错误');
    }
    const normalized = input.referenceImagePaths
      .filter((value): value is string => typeof value === 'string')
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
    if (normalized.length !== input.referenceImagePaths.length) {
      throw new AppError('E_INPUT_VALIDATION', '参考图片格式错误');
    }
    if (normalized.length > 9) {
      throw new AppError('E_INPUT_VALIDATION', '参考图片最多支持 9 张');
    }
    for (const path of normalized) {
      if (!existsSync(path)) {
        throw new AppError('E_INPUT_VALIDATION', `参考图片不存在：${path}`);
      }
    }
    if (normalized.length > 0) {
      referenceImagePaths = normalized;
    }
  }
  const referenceAudioPath =
    typeof input.referenceAudioPath === 'string' && input.referenceAudioPath.trim().length > 0
      ? input.referenceAudioPath.trim()
      : undefined;
  if (referenceAudioPath !== undefined && !existsSync(referenceAudioPath)) {
    throw new AppError('E_INPUT_VALIDATION', '参考音频不存在');
  }
  const variantCount = Math.trunc(requireNumber(input.variantCount ?? 1, '生成数量'));
  if (variantCount < 1 || variantCount > 5) {
    throw new AppError('E_INPUT_VALIDATION', '生成数量必须在 1..5');
  }
  const durationSec = Math.trunc(requireNumber(input.durationSec ?? 15, '视频时长'));
  const industryValue = industry as NativeIndustry;
  const maxDuration = industryValue === 'short_drama' ? 300 : industryValue === 'novel' ? 60 : 30;
  if (durationSec < 15 || durationSec > maxDuration) {
    throw new AppError('E_INPUT_VALIDATION', `视频时长必须在 15..${maxDuration} 秒`);
  }
  const ratio = input.ratio;
  if (typeof ratio !== 'string' || !NATIVE_RATIOS.includes(ratio as NativeRatio)) {
    throw new AppError('E_INPUT_VALIDATION', '视频比例不支持');
  }
  return {
    industry: industryValue,
    brief,
    ...(productName !== undefined ? { productName } : {}),
    ...(referenceVideoPath !== undefined ? { referenceVideoPath } : {}),
    ...(referenceImagePaths !== undefined ? { referenceImagePaths } : {}),
    ...(referenceAudioPath !== undefined ? { referenceAudioPath } : {}),
    variantCount,
    durationSec,
    ratio: ratio as NativeRatio,
    resolution: normalizeVideoResolution(input.resolution),
  };
}

function optionalTrimmedString(input: Record<string, unknown>, field: string, maxLength: number): string | undefined {
  const value = input[field];
  if (typeof value !== 'string' || value.trim().length === 0) {
    return undefined;
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    throw new AppError('E_INPUT_VALIDATION', `${field} 不能超过 ${maxLength} 字`);
  }
  return normalized;
}

function validateCopywriting(input: unknown): CopywritingInput {
  if (!isRecord(input)) {
    throw new AppError('E_INPUT_VALIDATION', '广告文案脚本输入格式错误');
  }
  const requirement = optionalTrimmedString(input, 'requirement', 4000);
  if (typeof input.requirement === 'string' && input.requirement.trim().length > 4000) {
    throw new AppError('E_INPUT_VALIDATION', '文案需求不能超过 4000 字');
  }
  const productName = optionalTrimmedString(input, 'productName', 100);
  const audience = optionalTrimmedString(input, 'audience', 200);
  const platform = optionalTrimmedString(input, 'platform', 80);
  const industry = input.industry ?? 'auto';
  if (
    typeof industry !== 'string' ||
    !COPYWRITING_INDUSTRIES.includes(industry as CopywritingIndustry)
  ) {
    throw new AppError('E_INPUT_VALIDATION', '广告文案行业模板不支持');
  }
  const format = input.format;
  if (
    typeof format !== 'string' ||
    !COPYWRITING_FORMATS.includes(format as CopywritingScriptFormat)
  ) {
    throw new AppError('E_INPUT_VALIDATION', '广告文案脚本形式不支持');
  }
  const variantCount = Math.trunc(requireNumber(input.variantCount ?? 3, '脚本数量'));
  if (variantCount < 1 || variantCount > 5) {
    throw new AppError('E_INPUT_VALIDATION', '脚本数量必须在 1..5');
  }
  const durationSec = Math.trunc(requireNumber(input.durationSec ?? 30, '目标时长'));
  if (durationSec < 15 || durationSec > 120) {
    throw new AppError('E_INPUT_VALIDATION', '目标时长必须在 15..120 秒');
  }
  if (input.enableWebSearch !== undefined && typeof input.enableWebSearch !== 'boolean') {
    throw new AppError('E_INPUT_VALIDATION', '联网补充开关必须是布尔值');
  }
  return {
    industry: industry as CopywritingIndustry,
    ...(requirement !== undefined ? { requirement } : {}),
    ...(productName !== undefined ? { productName } : {}),
    ...(audience !== undefined ? { audience } : {}),
    ...(platform !== undefined ? { platform } : {}),
    format: format as CopywritingScriptFormat,
    variantCount,
    durationSec,
    enableWebSearch: input.enableWebSearch !== false,
  };
}

function validateVideoScoring(input: unknown): VideoScoringInput {
  if (!isRecord(input)) {
    throw new AppError('E_INPUT_VALIDATION', '广告视频打分输入格式错误');
  }
  const sourceVideoPath = requireString(input.sourceVideoPath, '广告视频');
  if (!existsSync(sourceVideoPath)) {
    throw new AppError('E_INPUT_VALIDATION', '广告视频不存在');
  }
  const category = input.category;
  if (
    typeof category !== 'string' ||
    !VIDEO_SCORING_CATEGORIES.includes(category as (typeof VIDEO_SCORING_CATEGORIES)[number])
  ) {
    throw new AppError('E_INPUT_VALIDATION', '广告视频类型不支持');
  }
  return {
    sourceVideoPath,
    category: category as VideoScoringInput['category'],
  };
}

function validateEcommerceImage(input: unknown): EcommerceImageInput {
  if (!isRecord(input)) {
    throw new AppError('E_INPUT_VALIDATION', '电商图片包装输入格式错误');
  }
  const productImagePath = requireString(input.productImagePath, '商品主图');
  if (!existsSync(productImagePath)) {
    throw new AppError('E_INPUT_VALIDATION', '商品主图不存在');
  }
  const extension = extname(productImagePath).toLowerCase();
  if (!IMAGE_EXTENSIONS.has(extension)) {
    throw new AppError('E_INPUT_VALIDATION', '商品主图只支持 png、jpg、jpeg、webp、bmp');
  }
  const productName = optionalTrimmedString(input, 'productName', 100);
  const sellingPoints = optionalTrimmedString(input, 'sellingPoints', 1000);
  const fixedCopy = optionalTrimmedString(input, 'fixedCopy', 120);
  const scenePrompt = optionalTrimmedString(input, 'scenePrompt', 500);
  const variantCount = Math.trunc(requireNumber(input.variantCount ?? 3, '图片数量'));
  if (variantCount < 1 || variantCount > 5) {
    throw new AppError('E_INPUT_VALIDATION', '图片数量必须在 1..5');
  }
  const style = input.style ?? 'promotion';
  if (typeof style !== 'string' || !ECOMMERCE_IMAGE_STYLES.includes(style as EcommerceImageStyle)) {
    throw new AppError('E_INPUT_VALIDATION', '电商图片包装风格不支持');
  }
  return {
    productImagePath,
    ...(productName !== undefined ? { productName } : {}),
    ...(sellingPoints !== undefined ? { sellingPoints } : {}),
    ...(fixedCopy !== undefined ? { fixedCopy } : {}),
    ...(scenePrompt !== undefined ? { scenePrompt } : {}),
    variantCount,
    style: style as EcommerceImageStyle,
  };
}

function validateLarkDownload(input: unknown): LarkDownloadInput {
  if (!isRecord(input)) {
    throw new AppError('E_INPUT_VALIDATION', '飞书下载输入格式错误');
  }
  const url = requireString(input.url, '飞书链接');
  parseLarkDocumentUrl(url);

  const outputDir =
    typeof input.outputDir === 'string' && input.outputDir.trim().length > 0
      ? input.outputDir.trim()
      : undefined;
  if (input.outputDir !== undefined && outputDir === undefined) {
    throw new AppError('E_INPUT_VALIDATION', '输出目录不能为空字符串');
  }
  if (outputDir !== undefined && !isAbsolute(outputDir)) {
    throw new AppError('E_INPUT_VALIDATION', '输出目录必须是绝对路径');
  }

  return outputDir !== undefined ? { url, outputDir } : { url };
}

export function validateCreateTaskRequest(req: CreateTaskRequest): CreateTaskRequest {
  if (!isRecord(req)) {
    throw new AppError('E_INPUT_VALIDATION', '任务参数格式错误');
  }
  if (req.type === 'explosion') {
    return { type: 'explosion', input: validateExplosion(req.input) };
  }
  if (req.type === 'pretrailer') {
    return { type: 'pretrailer', input: validatePretrailer(req.input) };
  }
  if (req.type === 'avatar') {
    return { type: 'avatar', input: validateAvatar(req.input) };
  }
  if (req.type === 'native') {
    return { type: 'native', input: validateNative(req.input) };
  }
  if (req.type === 'copywriting') {
    return { type: 'copywriting', input: validateCopywriting(req.input) };
  }
  if (req.type === 'video_scoring') {
    return { type: 'video_scoring', input: validateVideoScoring(req.input) };
  }
  if (req.type === 'ecommerce_image') {
    return { type: 'ecommerce_image', input: validateEcommerceImage(req.input) };
  }
  if (req.type === 'lark_download') {
    return { type: 'lark_download', input: validateLarkDownload(req.input) };
  }
  throw new AppError('E_INPUT_VALIDATION', '任务类型不支持');
}
