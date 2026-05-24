import { existsSync } from 'node:fs';

import { AppError } from './errors.js';
import type {
  AvatarInput,
  CreateTaskRequest,
  ExplosionInput,
  PretrailerInput,
  PretrailerStyle,
} from '../shared/types.js';

const PRETRAILER_STYLES: readonly PretrailerStyle[] = [
  'auto',
  'suspense',
  'contrast',
  'pain',
  'benefit',
];

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

function validateExplosion(input: unknown): ExplosionInput {
  if (!isRecord(input)) {
    throw new AppError('E_INPUT_VALIDATION', '爆款裂变输入格式错误');
  }
  const douyinUrl = requireString(input.douyinUrl, '抖音链接');
  const variantCount = Math.trunc(requireNumber(input.variantCount ?? 3, '裂变数量'));
  if (variantCount < 1 || variantCount > 10) {
    throw new AppError('E_INPUT_VALIDATION', '裂变数量必须在 1..10');
  }
  return { douyinUrl, variantCount };
}

function validatePretrailer(input: unknown): PretrailerInput {
  if (!isRecord(input)) {
    throw new AppError('E_INPUT_VALIDATION', '广告前贴输入格式错误');
  }
  const sourceVideoPath = requireString(input.sourceVideoPath, '原广告视频');
  if (!existsSync(sourceVideoPath)) {
    throw new AppError('E_INPUT_VALIDATION', '原广告视频不存在');
  }
  const pretrailerDuration = Math.trunc(
    requireNumber(input.pretrailerDuration ?? 7, '前贴时长'),
  );
  if (pretrailerDuration < 5 || pretrailerDuration > 10) {
    throw new AppError('E_INPUT_VALIDATION', '前贴时长必须在 5..10 秒');
  }
  const style = input.style;
  if (typeof style !== 'string' || !PRETRAILER_STYLES.includes(style as PretrailerStyle)) {
    throw new AppError('E_INPUT_VALIDATION', '前贴风格不支持');
  }
  return { sourceVideoPath, pretrailerDuration, style: style as PretrailerStyle };
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
  if (!Array.isArray(rawProductImages) || rawProductImages.length < 1 || rawProductImages.length > 3) {
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
  return { avatarImagePath, brandIntro, productImagePaths, duration };
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
  throw new AppError('E_INPUT_VALIDATION', '任务类型不支持');
}
