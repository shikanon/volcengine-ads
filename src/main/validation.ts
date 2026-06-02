import { existsSync } from 'node:fs';

import { AppError } from './errors.js';
import {
  DEFAULT_VIDEO_RESOLUTION,
  COPYWRITING_SCRIPT_FORMAT_DEFINITIONS,
  PRETRAILER_VIDEO_TYPE_DEFINITIONS,
  VIDEO_RESOLUTION_OPTIONS,
  normalizePretrailerStyle,
} from '../shared/types.js';
import type {
  AvatarInput,
  CopywritingIndustry,
  CopywritingInput,
  CopywritingScriptFormat,
  CreateTaskRequest,
  ExplosionInput,
  NativeIndustry,
  NativeInput,
  NativeRatio,
  PretrailerInput,
  VideoResolution,
} from '../shared/types.js';

const NATIVE_INDUSTRIES: readonly NativeIndustry[] = [
  'game',
  'short_drama',
  'novel',
  'social',
  'tool',
  'ecommerce',
];
const NATIVE_RATIOS: readonly NativeRatio[] = ['9:16', '16:9', '1:1'];
const COPYWRITING_FORMATS: readonly CopywritingScriptFormat[] =
  COPYWRITING_SCRIPT_FORMAT_DEFINITIONS.map((definition) => definition.value);
const COPYWRITING_INDUSTRIES: readonly CopywritingIndustry[] = ['auto', ...NATIVE_INDUSTRIES];
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
  return sourceVideoPath.length > 0
    ? { sourceVideoPath, variantCount, resolution }
    : { douyinUrl, variantCount, resolution };
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
    throw new AppError('E_INPUT_VALIDATION', '原生爆款输入格式错误');
  }
  const industry = input.industry;
  if (typeof industry !== 'string' || !NATIVE_INDUSTRIES.includes(industry as NativeIndustry)) {
    throw new AppError('E_INPUT_VALIDATION', '原生爆款行业不支持');
  }
  const brief = requireString(input.brief, '创意简报');
  if (brief.length < 10 || brief.length > 2000) {
    throw new AppError('E_INPUT_VALIDATION', '创意简报需在 10..2000 字');
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
  const requirement = requireString(input.requirement, '文案需求');
  if (requirement.length < 10 || requirement.length > 4000) {
    throw new AppError('E_INPUT_VALIDATION', '文案需求需在 10..4000 字');
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
    requirement,
    ...(productName !== undefined ? { productName } : {}),
    ...(audience !== undefined ? { audience } : {}),
    ...(platform !== undefined ? { platform } : {}),
    format: format as CopywritingScriptFormat,
    variantCount,
    durationSec,
    enableWebSearch: input.enableWebSearch !== false,
  };
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
  throw new AppError('E_INPUT_VALIDATION', '任务类型不支持');
}
