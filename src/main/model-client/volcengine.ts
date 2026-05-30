import { existsSync, readFileSync, statSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, extname } from 'node:path';

import pLimit from 'p-limit';
import pRetry from 'p-retry';
import { fetch } from 'undici';

import { AppError } from '../errors.js';
import type { RuntimeCredentials } from '../secure/keystore.js';
import { uploadLocalFileForAsr } from '../storage/aliyun-oss.js';
import { SUPPORTED_TTS_SPEAKERS } from '../../shared/types.js';
import type {
  AudioResult,
  ChatContentPart,
  ChatMessage,
  ChatOptions,
  ImageResult,
  ModelClient,
  RuntimeCredentialsLoader,
  SeedreamImageRequest,
  SeedanceAvatarRequest,
  SeedanceVideoRequest,
  TranscriptResult,
  VideoResult,
  VisionOptions,
} from './index.js';

const MODEL_LIMIT = pLimit(2);
const DEFAULT_POLL_INTERVAL_MS = 5000;
const DEFAULT_POLL_TIMEOUT_MS = 600_000;
const ASR_POLL_INTERVAL_MS = 3000;
const ASR_POLL_TIMEOUT_MS = 300_000;
const SEEDANCE_RESOLUTIONS = new Set(['480p', '720p', '1080p']);
const SEEDANCE_RATIOS = new Set(['16:9', '4:3', '1:1', '3:4', '9:16', '21:9', 'adaptive']);
const SEEDANCE_IMAGE_EXTS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.bmp',
  '.tiff',
  '.tif',
  '.gif',
  '.heic',
  '.heif',
]);
const SEEDREAM_IMAGE_EXTS = SEEDANCE_IMAGE_EXTS;
const SEEDANCE_VIDEO_EXTS = new Set(['.mp4', '.mov']);
const SEEDANCE_AUDIO_EXTS = new Set(['.wav', '.mp3']);
const ASR_AUDIO_EXTS = new Set(['.wav', '.mp3', '.ogg', '.m4a']);
const TTS_AUDIO_CHUNK_CODES = new Set([0, 3000]);
const TTS_SUCCESS_TERMINAL_CODES = new Set([20000000]);
const TTS_RESOURCE_ID = 'seed-tts-2.0';
const MIB = 1024 * 1024;
const EMPTY_TRANSCRIPT: TranscriptResult = { text: '', segments: [] };

interface ArkTaskResponse {
  id?: string;
  task_id?: string;
  status?: string;
  content?: {
    video_url?: string;
  };
  video_url?: string;
  error?: {
    code?: string;
    message?: string;
    param?: string;
    type?: string;
  };
}

interface ImageGenerationResponse {
  data?: Array<{
    url?: string;
    b64_json?: string;
    error?: {
      message?: string;
    };
  }>;
}

interface AsrQueryResponse {
  result?: {
    text?: string;
    utterances?: Array<{
      start_time?: number;
      end_time?: number;
      text?: string;
    }>;
  };
}

function isAsrNoSpeech(statusCode: string | null, message: string): boolean {
  return (
    statusCode === '20000003' &&
    /normal silence audio|no valid speech|no speech|silence audio|无有效(?:语音|人声)|静音/iu.test(
      message,
    )
  );
}

type AsrSubmitResult = 'submitted' | 'empty_transcript';

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}

function requireNonEmpty(value: string | undefined, field: string): string {
  const normalized = value?.trim();
  if (!normalized) {
    throw new AppError('E_INPUT_VALIDATION', `${field} 不能为空`);
  }
  return normalized;
}

function normalizeTtsSpeaker(value: string | undefined, fallback: string): string {
  const speaker = (value ?? fallback).trim();
  if (speaker === 'volcano_tts') {
    return 'zh_female_vv_uranus_bigtts';
  }
  if (!SUPPORTED_TTS_SPEAKERS.includes(speaker as (typeof SUPPORTED_TTS_SPEAKERS)[number])) {
    throw new AppError(
      'E_INPUT_VALIDATION',
      `TTS 音色不支持：${speaker}，请使用设置页提供的音色`,
    );
  }
  return speaker;
}

function requireLocalFile(path: string | undefined, field: string): string {
  const normalized = requireNonEmpty(path, field);
  if (!existsSync(normalized)) {
    throw new AppError('E_INPUT_VALIDATION', `${field} 不存在：${normalized}`);
  }
  return normalized;
}

function requireSupportedExt(path: string, field: string, supportedExts: Set<string>): void {
  const ext = extname(path).toLowerCase();
  if (!supportedExts.has(ext)) {
    throw new AppError('E_INPUT_VALIDATION', `${field} 格式不支持：${ext || '未知'}`);
  }
}

function requireMaxFileSize(path: string, field: string, maxMiB: number): void {
  const size = statSync(path).size;
  if (size <= 0) {
    throw new AppError('E_INPUT_VALIDATION', `${field} 不能为空文件`);
  }
  if (size >= maxMiB * MIB) {
    throw new AppError('E_INPUT_VALIDATION', `${field} 必须小于 ${maxMiB} MB`);
  }
}

interface ImageMetadata {
  width: number;
  height: number;
}

function readPngMetadata(bytes: Buffer): ImageMetadata | undefined {
  if (bytes.length >= 24 && bytes[0] === 0x89 && bytes.toString('ascii', 1, 4) === 'PNG') {
    return {
      width: bytes.readUInt32BE(16),
      height: bytes.readUInt32BE(20),
    };
  }
  return undefined;
}

function readGifMetadata(bytes: Buffer): ImageMetadata | undefined {
  if (bytes.length >= 10 && bytes.toString('ascii', 0, 3) === 'GIF') {
    return {
      width: bytes.readUInt16LE(6),
      height: bytes.readUInt16LE(8),
    };
  }
  return undefined;
}

function readBmpMetadata(bytes: Buffer): ImageMetadata | undefined {
  if (bytes.length >= 26 && bytes.toString('ascii', 0, 2) === 'BM') {
    return {
      width: Math.abs(bytes.readInt32LE(18)),
      height: Math.abs(bytes.readInt32LE(22)),
    };
  }
  return undefined;
}

function readJpegMetadata(bytes: Buffer): ImageMetadata | undefined {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return undefined;
  }
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    const size = bytes.readUInt16BE(offset + 2);
    if (
      marker !== undefined &&
      ((marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf))
    ) {
      return {
        height: bytes.readUInt16BE(offset + 5),
        width: bytes.readUInt16BE(offset + 7),
      };
    }
    if (size < 2) {
      return undefined;
    }
    offset += 2 + size;
  }
  return undefined;
}

function readWebpMetadata(bytes: Buffer): ImageMetadata | undefined {
  if (
    bytes.length < 30 ||
    bytes.toString('ascii', 0, 4) !== 'RIFF' ||
    bytes.toString('ascii', 8, 12) !== 'WEBP'
  ) {
    return undefined;
  }
  const chunk = bytes.toString('ascii', 12, 16);
  if (chunk === 'VP8X') {
    return {
      width: 1 + bytes.readUIntLE(24, 3),
      height: 1 + bytes.readUIntLE(27, 3),
    };
  }
  if (chunk === 'VP8 ' && bytes.length >= 30) {
    return {
      width: bytes.readUInt16LE(26) & 0x3fff,
      height: bytes.readUInt16LE(28) & 0x3fff,
    };
  }
  if (chunk === 'VP8L' && bytes.length >= 25) {
    const bits = bytes.readUInt32LE(21);
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1,
    };
  }
  return undefined;
}

function readImageMetadata(path: string): ImageMetadata | undefined {
  const bytes = readFileSync(path);
  return (
    readPngMetadata(bytes) ??
    readJpegMetadata(bytes) ??
    readWebpMetadata(bytes) ??
    readGifMetadata(bytes) ??
    readBmpMetadata(bytes)
  );
}

function requireImageBounds(
  path: string,
  field: string,
  bounds: {
    minWidthExclusive?: number;
    maxWidthExclusive?: number;
    minRatioInclusive?: number;
    maxRatioInclusive?: number;
    minRatioExclusive?: number;
    maxRatioExclusive?: number;
    maxPixels?: number;
  },
): void {
  const metadata = readImageMetadata(path);
  if (!metadata) {
    return;
  }
  const { width, height } = metadata;
  if (width <= 0 || height <= 0) {
    throw new AppError('E_INPUT_VALIDATION', `${field} 宽高无效`);
  }
  if (bounds.minWidthExclusive !== undefined) {
    if (width <= bounds.minWidthExclusive || height <= bounds.minWidthExclusive) {
      throw new AppError(
        'E_INPUT_VALIDATION',
        `${field} 宽高必须大于 ${bounds.minWidthExclusive}px`,
      );
    }
  }
  if (bounds.maxWidthExclusive !== undefined) {
    if (width >= bounds.maxWidthExclusive || height >= bounds.maxWidthExclusive) {
      throw new AppError(
        'E_INPUT_VALIDATION',
        `${field} 宽高必须小于 ${bounds.maxWidthExclusive}px`,
      );
    }
  }
  if (bounds.maxPixels !== undefined && width * height > bounds.maxPixels) {
    throw new AppError('E_INPUT_VALIDATION', `${field} 总像素不能超过 ${bounds.maxPixels}`);
  }
  const ratio = width / height;
  if (
    bounds.minRatioInclusive !== undefined &&
    (ratio < bounds.minRatioInclusive || ratio > (bounds.maxRatioInclusive ?? Infinity))
  ) {
    throw new AppError('E_INPUT_VALIDATION', `${field} 宽高比超出范围`);
  }
  if (
    bounds.minRatioExclusive !== undefined &&
    (ratio <= bounds.minRatioExclusive || ratio >= (bounds.maxRatioExclusive ?? Infinity))
  ) {
    throw new AppError('E_INPUT_VALIDATION', `${field} 宽高比超出范围`);
  }
}

function requireRange(value: number | undefined, field: string, min: number, max: number): number {
  const normalized = value ?? min;
  if (!Number.isFinite(normalized) || normalized < min || normalized > max) {
    throw new AppError('E_INPUT_VALIDATION', `${field} 必须在 ${min}..${max}`);
  }
  return normalized;
}

function requireIntegerRange(
  value: number | undefined,
  field: string,
  min: number,
  max: number,
): number {
  const normalized = requireRange(value, field, min, max);
  if (!Number.isInteger(normalized)) {
    throw new AppError('E_INPUT_VALIDATION', `${field} 必须是整数`);
  }
  return normalized;
}

function normalizeSeedanceResolution(resolution: string | undefined): string {
  if (resolution === undefined) {
    return '720p';
  }
  if (resolution === '720x1280') {
    return '720p';
  }
  if (resolution === '1080x1920' || resolution === '1920x1080') {
    return '1080p';
  }
  if (!SEEDANCE_RESOLUTIONS.has(resolution)) {
    throw new AppError('E_INPUT_VALIDATION', 'Seedance 分辨率只支持 480p、720p、1080p');
  }
  return resolution;
}

function normalizeSeedanceRatio(ratio: string | undefined): string {
  const normalized = ratio ?? 'adaptive';
  if (!SEEDANCE_RATIOS.has(normalized)) {
    throw new AppError('E_INPUT_VALIDATION', 'Seedance 宽高比不支持');
  }
  return normalized;
}

function normalizeSeedreamSize(size: string | undefined): string {
  const normalized = size ?? '2K';
  if (normalized === '2K' || normalized === '3K' || normalized === '4K') {
    return normalized;
  }
  const match = /^(\d{2,5})x(\d{2,5})$/.exec(normalized);
  if (!match) {
    throw new AppError('E_INPUT_VALIDATION', 'Seedream 输出尺寸只支持 2K、3K、4K 或 <宽>x<高>');
  }
  const width = Number(match[1]);
  const height = Number(match[2]);
  const pixels = width * height;
  const ratio = width / height;
  if (pixels < 3_686_400 || pixels > 16_777_216 || ratio < 1 / 16 || ratio > 16) {
    throw new AppError('E_INPUT_VALIDATION', 'Seedream 输出尺寸超出模型支持范围');
  }
  return normalized;
}

function validateSeedreamImage(path: string, field: string): void {
  requireSupportedExt(path, field, SEEDREAM_IMAGE_EXTS);
  requireMaxFileSize(path, field, 30);
  requireImageBounds(path, field, {
    minWidthExclusive: 14,
    minRatioInclusive: 1 / 16,
    maxRatioInclusive: 16,
    maxPixels: 36_000_000,
  });
}

function validateSeedanceImage(path: string, field: string): void {
  requireSupportedExt(path, field, SEEDANCE_IMAGE_EXTS);
  requireMaxFileSize(path, field, 30);
  requireImageBounds(path, field, {
    minWidthExclusive: 300,
    maxWidthExclusive: 6000,
    minRatioExclusive: 0.4,
    maxRatioExclusive: 2.5,
  });
}

function validateSeedanceVideo(path: string, field: string): void {
  requireSupportedExt(path, field, SEEDANCE_VIDEO_EXTS);
  requireMaxFileSize(path, field, 50);
}

function validateSeedanceAudio(path: string, field: string): void {
  requireSupportedExt(path, field, SEEDANCE_AUDIO_EXTS);
  requireMaxFileSize(path, field, 15);
}

function validateAsrAudio(path: string, field: string): void {
  requireSupportedExt(path, field, ASR_AUDIO_EXTS);
  requireMaxFileSize(path, field, 100);
}

function requireContentUrl(value: string | undefined, field: string): string {
  const normalized = requireNonEmpty(value, field);
  if (
    !isHttpUrl(normalized) &&
    !normalized.startsWith('data:image/') &&
    !normalized.startsWith('data:video/') &&
    !normalized.startsWith('asset://')
  ) {
    throw new AppError('E_INPUT_VALIDATION', `${field} 必须是 URL、data URL 或 asset:// ID`);
  }
  return normalized;
}

function validateChatMessages(messages: ChatMessage[]): void {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new AppError('E_INPUT_VALIDATION', 'LLM 消息不能为空');
  }
  for (const [index, message] of messages.entries()) {
    if (!['system', 'user', 'assistant'].includes(message.role)) {
      throw new AppError('E_INPUT_VALIDATION', `LLM 消息 ${index + 1} 角色不支持`);
    }
    if (typeof message.content === 'string') {
      requireNonEmpty(message.content, `LLM 消息 ${index + 1}`);
      continue;
    }
    if (!Array.isArray(message.content) || message.content.length === 0) {
      throw new AppError('E_INPUT_VALIDATION', `LLM 消息 ${index + 1} 内容不能为空`);
    }
    for (const [partIndex, part] of message.content.entries()) {
      if (part.type === 'text') {
        requireNonEmpty(part.text, `LLM 消息 ${index + 1}.${partIndex + 1} 文本`);
      } else if (part.type === 'image_url') {
        requireContentUrl(part.image_url.url, `LLM 消息 ${index + 1}.${partIndex + 1} 图片`);
      } else if (part.type === 'video_url') {
        requireContentUrl(part.video_url.url, `LLM 消息 ${index + 1}.${partIndex + 1} 视频`);
      } else {
        throw new AppError('E_INPUT_VALIDATION', `LLM 消息 ${index + 1} 内容类型不支持`);
      }
    }
  }
}

function contentTypeFor(path: string): string {
  const ext = extname(path).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.bmp') return 'image/bmp';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.tif' || ext === '.tiff') return 'image/tiff';
  if (ext === '.heic') return 'image/heic';
  if (ext === '.heif') return 'image/heif';
  if (ext === '.wav') return 'audio/wav';
  if (ext === '.m4a') return 'audio/mp4';
  if (ext === '.mp3') return 'audio/mpeg';
  if (ext === '.ogg') return 'audio/ogg';
  if (ext === '.mov') return 'video/quicktime';
  return 'video/mp4';
}

function isHttpUrl(value: string): boolean {
  return value.startsWith('http://') || value.startsWith('https://');
}

function inferAudioFormat(pathOrUrl: string): string {
  const pathname = pathOrUrl.split('?')[0] ?? pathOrUrl;
  const ext = extname(pathname).replace('.', '').toLowerCase();
  if (ext === 'wav' || ext === 'mp3' || ext === 'ogg') {
    return ext;
  }
  return 'mp3';
}

async function fileToDataUrl(path: string): Promise<string> {
  const bytes = await readFile(path);
  return `data:${contentTypeFor(path)};base64,${bytes.toString('base64')}`;
}

async function downloadFile(url: string, outputPath: string): Promise<void> {
  await mkdir(dirname(outputPath), { recursive: true });
  const response = await fetch(url);
  if (!response.ok) {
    const body = await response.text();
    throw new AppError(
      'E_MODEL_API_FAILED',
      `下载模型结果失败：HTTP ${response.status} ${response.statusText} ${body.slice(0, 300)}`,
    );
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(outputPath, buffer);
}

async function parseJson<T>(response: Awaited<ReturnType<typeof fetch>>): Promise<T> {
  const body = (await response.text()) || '{}';
  if (!response.ok) {
    if (response.status === 400) {
      throw new AppError(
        'E_INPUT_VALIDATION',
        `云端参数校验失败：HTTP ${response.status} ${response.statusText} ${body.slice(0, 500)}`,
      );
    }
    throw new AppError(
      'E_MODEL_API_FAILED',
      `HTTP ${response.status} ${response.statusText}: ${body.slice(0, 500)}`,
    );
  }
  return JSON.parse(body) as T;
}

function extractTaskId(data: ArkTaskResponse): string {
  const taskId = data.id ?? data.task_id;
  if (!taskId) {
    throw new AppError('E_MODEL_API_FAILED', '视频任务响应缺少 task id');
  }
  return taskId;
}

function extractVideoUrl(data: ArkTaskResponse): string | undefined {
  return data.content?.video_url ?? data.video_url;
}

function summarizeArkTaskFailure(data: ArkTaskResponse, taskId: string): string {
  const errorParts = [
    data.error?.code ? `code=${data.error.code}` : undefined,
    data.error?.type ? `type=${data.error.type}` : undefined,
    data.error?.param ? `param=${data.error.param}` : undefined,
    data.error?.message ? `message=${data.error.message}` : undefined,
  ].filter((part): part is string => part !== undefined);
  const raw = JSON.stringify(data).slice(0, 1000);
  return [
    `task_id=${taskId}`,
    data.status ? `status=${data.status}` : undefined,
    errorParts.length > 0 ? errorParts.join(', ') : undefined,
    `raw=${raw}`,
  ]
    .filter((part): part is string => part !== undefined)
    .join('；');
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export class VolcengineModelClient implements ModelClient {
  constructor(private readonly credentials: RuntimeCredentials) {}

  async generateImage(req: SeedreamImageRequest): Promise<ImageResult> {
    const credentials = this.credentials;
    if (!credentials.imageApiKey) {
      throw new AppError('E_MODEL_API_FAILED', '图片生成 API Key 未配置');
    }
    const refImagePath = requireLocalFile(req.refImagePath, '图片生成参考图');
    validateSeedreamImage(refImagePath, '图片生成参考图');
    const prompt = requireNonEmpty(req.prompt, '图片生成提示词');
    const outputPath = requireNonEmpty(req.outputPath, '图片生成输出路径');
    const size = normalizeSeedreamSize(req.size);
    return MODEL_LIMIT(() =>
      pRetry(
        async () => {
          const response = await fetch(
            joinUrl(credentials.provider.imageBaseUrl, '/images/generations'),
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${credentials.imageApiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                model: credentials.provider.imageModel,
                prompt,
                image: await fileToDataUrl(refImagePath),
                size,
                output_format: 'png',
                response_format: 'url',
                watermark: false,
              }),
            },
          );
          const data = await parseJson<ImageGenerationResponse>(response);
          const firstImage = data.data?.[0];
          if (!firstImage || firstImage.error) {
            throw new AppError(
              'E_MODEL_API_FAILED',
              firstImage?.error?.message ?? '图片生成响应为空',
            );
          }
          if (firstImage.url) {
            await downloadFile(firstImage.url, outputPath);
          } else if (firstImage.b64_json) {
            await mkdir(dirname(outputPath), { recursive: true });
            await writeFile(outputPath, Buffer.from(firstImage.b64_json, 'base64'));
          } else {
            throw new AppError('E_MODEL_API_FAILED', '图片生成响应缺少图片数据');
          }
          return { localPath: outputPath };
        },
        { retries: 3, factor: 2 },
      ),
    );
  }

  async generateVideo(req: SeedanceVideoRequest): Promise<VideoResult> {
    const prompt = requireNonEmpty(req.prompt, 'Seedance 提示词');
    const outputPath = requireNonEmpty(req.outputPath, 'Seedance 输出路径');
    const durationSec = requireIntegerRange(req.durationSec ?? 10, 'Seedance 视频时长', 4, 15);
    const resolution = normalizeSeedanceResolution(req.resolution);
    const ratio = normalizeSeedanceRatio(req.ratio);
    const refImagePaths = req.refImagePaths ?? [];
    if (refImagePaths.length > 9) {
      throw new AppError('E_INPUT_VALIDATION', 'Seedance 参考图最多支持 9 张');
    }
    const content: Array<Record<string, unknown>> = [{ type: 'text', text: prompt }];
    if (refImagePaths.length > 0) {
      for (const imagePath of refImagePaths) {
        const refImagePath = requireLocalFile(imagePath, 'Seedance 参考图');
        validateSeedanceImage(refImagePath, 'Seedance 参考图');
        content.push({
          type: 'image_url',
          image_url: { url: await fileToDataUrl(refImagePath) },
          role: 'reference_image',
        });
      }
    }
    if (req.refVideoPath) {
      const refVideoPath = requireLocalFile(req.refVideoPath, 'Seedance 参考视频');
      validateSeedanceVideo(refVideoPath, 'Seedance 参考视频');
      content.push({
        type: 'video_url',
        video_url: { url: await fileToDataUrl(refVideoPath) },
        role: 'reference_video',
      });
    }
    return this.submitAndDownloadVideo(
      content,
      outputPath,
      durationSec,
      resolution,
      ratio,
      req.generateAudio ?? false,
    );
  }

  async generateDigitalHuman(req: SeedanceAvatarRequest): Promise<VideoResult> {
    const avatarImagePath = requireLocalFile(req.avatarImagePath, '数字人参考图');
    const audioPath = requireLocalFile(req.audioPath, '数字人口播音频');
    validateSeedanceImage(avatarImagePath, '数字人参考图');
    validateSeedanceAudio(audioPath, '数字人口播音频');
    const outputPath = requireNonEmpty(req.outputPath, '数字人视频输出路径');
    const durationSec = requireIntegerRange(req.durationSec ?? 15, '数字人视频时长', 4, 15);
    const content = [
      {
        type: 'image_url',
        image_url: { url: await fileToDataUrl(avatarImagePath) },
        role: 'reference_image',
      },
      {
        type: 'audio_url',
        audio_url: { url: await fileToDataUrl(audioPath) },
        role: 'reference_audio',
      },
      {
        type: 'text',
        text: req.prompt ?? '基于参考音频驱动数字人口播，保持正面构图、自然唇形和轻微表情动作。',
      },
    ];
    return this.submitAndDownloadVideo(content, outputPath, durationSec, '720p');
  }

  async asr(audioPath: string): Promise<TranscriptResult> {
    const credentials = this.credentials;
    if (!credentials.asrApiKey && (!credentials.asrAppId || !credentials.asrToken)) {
      throw new AppError('E_MODEL_API_FAILED', 'ASR 凭据未配置');
    }
    const normalizedAudioPath = requireNonEmpty(audioPath, 'ASR 音频');
    if (!isHttpUrl(normalizedAudioPath)) {
      validateAsrAudio(requireLocalFile(normalizedAudioPath, 'ASR 音频'), 'ASR 音频');
    }
    const audioUrl = isHttpUrl(normalizedAudioPath)
      ? normalizedAudioPath
      : (
          await uploadLocalFileForAsr(
            credentials,
            requireLocalFile(normalizedAudioPath, 'ASR 音频'),
          )
        ).signedUrl;
    return MODEL_LIMIT(() =>
      pRetry(
        async () => {
          const requestId = randomUUID();
          const submitResult = await this.submitAsrTask(audioUrl, requestId);
          if (submitResult === 'empty_transcript') {
            return EMPTY_TRANSCRIPT;
          }
          return this.pollAsrTask(requestId);
        },
        { retries: 3, factor: 2 },
      ),
    );
  }

  private asrHeaders(requestId: string, includeSequence: boolean): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Api-Resource-Id': this.credentials.provider.asrResourceId,
      'X-Api-Request-Id': requestId,
    };
    if (this.credentials.asrApiKey) {
      headers['X-Api-Key'] = this.credentials.asrApiKey;
    } else {
      headers['X-Api-App-Key'] = this.credentials.asrAppId ?? '';
      headers['X-Api-Access-Key'] = this.credentials.asrToken ?? '';
    }
    if (includeSequence) {
      headers['X-Api-Sequence'] = '-1';
    }
    return headers;
  }

  private async submitAsrTask(audioUrl: string, requestId: string): Promise<AsrSubmitResult> {
    const response = await fetch(
      joinUrl(this.credentials.provider.asrBaseUrl, '/api/v3/auc/bigmodel/submit'),
      {
        method: 'POST',
        headers: this.asrHeaders(requestId, true),
        body: JSON.stringify({
          user: { uid: 'volcengine_ads_local' },
          audio: {
            url: audioUrl,
            format: inferAudioFormat(audioUrl),
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
    if (!response.ok) {
      throw new AppError('E_MODEL_API_FAILED', `ASR submit HTTP ${response.status}`);
    }
    const statusCode = response.headers.get('x-api-status-code');
    const message = response.headers.get('x-api-message') ?? 'Unknown';
    if (isAsrNoSpeech(statusCode, message)) {
      return 'empty_transcript';
    }
    if (statusCode !== '20000000') {
      throw new AppError('E_MODEL_API_FAILED', `ASR submit ${statusCode}: ${message}`);
    }
    return 'submitted';
  }

  private async pollAsrTask(requestId: string): Promise<TranscriptResult> {
    const started = Date.now();
    while (Date.now() - started < ASR_POLL_TIMEOUT_MS) {
      const response = await fetch(
        joinUrl(this.credentials.provider.asrBaseUrl, '/api/v3/auc/bigmodel/query'),
        {
          method: 'POST',
          headers: this.asrHeaders(requestId, false),
          body: '{}',
        },
      );
      if (!response.ok) {
        throw new AppError('E_MODEL_API_FAILED', `ASR query HTTP ${response.status}`);
      }
      const statusCode = response.headers.get('x-api-status-code');
      const message = response.headers.get('x-api-message') ?? 'Unknown';
      if (statusCode === '20000001' || statusCode === '20000002') {
        await sleep(ASR_POLL_INTERVAL_MS);
        continue;
      }
      if (isAsrNoSpeech(statusCode, message)) {
        return EMPTY_TRANSCRIPT;
      }
      if (statusCode === '20000003') {
        throw new AppError('E_MODEL_API_FAILED', `ASR query ${statusCode}: ${message}`);
      }
      if (statusCode !== '20000000') {
        throw new AppError('E_MODEL_API_FAILED', `ASR query ${statusCode}: ${message}`);
      }

      const data = (await response.json()) as AsrQueryResponse;
      const utterances = data.result?.utterances ?? [];
      return {
        text: data.result?.text ?? '',
        segments: utterances.map((item) => ({
          start: (item.start_time ?? 0) / 1000,
          end: (item.end_time ?? 0) / 1000,
          text: item.text ?? '',
        })),
      };
    }
    throw new AppError('E_MODEL_API_FAILED', 'ASR 任务轮询超时');
  }

  async tts(text: string, voice?: string): Promise<AudioResult> {
    const credentials = this.credentials;
    if (!credentials.ttsApiKey && (!credentials.ttsAppId || !credentials.ttsToken)) {
      throw new AppError('E_MODEL_API_FAILED', 'TTS API Key 未配置');
    }
    const normalizedText = requireNonEmpty(text, 'TTS 文本');
    const normalizedVoice = normalizeTtsSpeaker(voice, credentials.provider.ttsVoice);
    if (normalizedText.length > 1000) {
      throw new AppError('E_INPUT_VALIDATION', 'TTS 文本不能超过 1000 字符');
    }
    const outputPath = `${process.cwd()}/tmp/tts-${Date.now()}.mp3`;
    return MODEL_LIMIT(() =>
      pRetry(
        async () => {
          const response = await fetch(
            joinUrl(credentials.provider.ttsBaseUrl, '/api/v3/tts/unidirectional'),
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(credentials.ttsApiKey
                  ? { 'X-Api-Key': credentials.ttsApiKey }
                  : {
                      'X-Api-App-Id': credentials.ttsAppId ?? '',
                      'X-Api-Access-Key': credentials.ttsToken ?? '',
                    }),
                'X-Api-Resource-Id': TTS_RESOURCE_ID,
              },
              body: JSON.stringify({
                user: { uid: 'volcengine_ads_local' },
                req_params: {
                  text: normalizedText,
                  speaker: normalizedVoice,
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
          const body = await response.text();
          if (!response.ok) {
            throw new AppError(
              'E_MODEL_API_FAILED',
              `TTS HTTP ${response.status} ${response.statusText} speaker=${normalizedVoice} resource=${TTS_RESOURCE_ID} body=${body.slice(0, 500)}`,
            );
          }
          const chunks: Buffer[] = [];
          for (const line of body.split('\n')) {
            if (!line.trim()) continue;
            const data = JSON.parse(line) as { code?: number; data?: string; message?: string };
            if (data.code !== undefined && TTS_AUDIO_CHUNK_CODES.has(data.code) && data.data) {
              chunks.push(Buffer.from(data.data, 'base64'));
            } else if (
              data.code !== undefined &&
              !TTS_AUDIO_CHUNK_CODES.has(data.code) &&
              !TTS_SUCCESS_TERMINAL_CODES.has(data.code) &&
              data.code !== 3031 &&
              !data.data
            ) {
              throw new AppError(
                'E_MODEL_API_FAILED',
                `TTS code ${data.code} speaker=${normalizedVoice} resource=${TTS_RESOURCE_ID}: ${data.message ?? '未知错误'}`,
              );
            }
          }
          if (chunks.length === 0) {
            throw new AppError('E_MODEL_API_FAILED', 'TTS 响应未包含音频');
          }
          await mkdir(dirname(outputPath), { recursive: true });
          await writeFile(outputPath, Buffer.concat(chunks));
          return { localPath: outputPath, duration: 0 };
        },
        { retries: 3, factor: 2 },
      ),
    );
  }

  async chat(messages: ChatMessage[], opts?: ChatOptions): Promise<string> {
    const credentials = this.credentials;
    if (!credentials.llmApiKey) {
      throw new AppError('E_MODEL_API_FAILED', 'LLM API Key 未配置');
    }
    validateChatMessages(messages);
    if (
      opts?.temperature !== undefined &&
      (!Number.isFinite(opts.temperature) || opts.temperature < 0 || opts.temperature > 2)
    ) {
      throw new AppError('E_INPUT_VALIDATION', 'LLM temperature 必须在 0..2');
    }
    return MODEL_LIMIT(() =>
      pRetry(
        async () => {
          const response = await fetch(
            joinUrl(credentials.provider.llmBaseUrl, '/chat/completions'),
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${credentials.llmApiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                model: credentials.provider.llmModel,
                messages,
                temperature: opts?.temperature ?? 0.7,
                response_format: opts?.jsonSchema ? { type: 'json_object' } : undefined,
              }),
            },
          );
          const data = await parseJson<{ choices?: Array<{ message?: { content?: string } }> }>(
            response,
          );
          const content = data.choices?.[0]?.message?.content;
          if (!content) {
            throw new AppError('E_MODEL_API_FAILED', 'LLM 响应为空');
          }
          return content;
        },
        { retries: 3, factor: 2 },
      ),
    );
  }

  async vision(images: string[], prompt: string, opts?: VisionOptions): Promise<string> {
    if (!Array.isArray(images) || images.length === 0) {
      throw new AppError('E_INPUT_VALIDATION', '视觉理解图片不能为空');
    }
    const normalizedPrompt = requireNonEmpty(prompt, '视觉理解提示词');
    const content: ChatContentPart[] = [
      ...(await Promise.all(
        images.map(
          async (imagePath): Promise<ChatContentPart> => ({
            type: 'image_url',
            image_url: { url: await fileToDataUrl(requireLocalFile(imagePath, '视觉理解图片')) },
          }),
        ),
      )),
      { type: 'text', text: normalizedPrompt },
    ];
    return this.chat([{ role: 'user', content }], {
      temperature: opts?.temperature ?? 0.2,
      ...(opts?.jsonSchema !== undefined ? { jsonSchema: opts.jsonSchema } : {}),
      ...(opts?.reasoningEffort !== undefined ? { reasoningEffort: opts.reasoningEffort } : {}),
    });
  }

  async visionVideo(videoPath: string, prompt: string, opts?: VisionOptions): Promise<string> {
    const normalizedVideoPath = requireLocalFile(videoPath, '视觉理解视频');
    const normalizedPrompt = requireNonEmpty(prompt, '视觉理解提示词');
    const content: ChatContentPart[] = [
      {
        type: 'video_url',
        video_url: { url: await fileToDataUrl(normalizedVideoPath) },
      },
      { type: 'text', text: normalizedPrompt },
    ];
    return this.chat([{ role: 'user', content }], {
      temperature: opts?.temperature ?? 0.2,
      ...(opts?.jsonSchema !== undefined ? { jsonSchema: opts.jsonSchema } : {}),
      ...(opts?.reasoningEffort !== undefined ? { reasoningEffort: opts.reasoningEffort } : {}),
    });
  }

  private async submitAndDownloadVideo(
    content: Array<Record<string, unknown>>,
    outputPath: string,
    durationSec = 10,
    resolution = '720p',
    ratio = 'adaptive',
    generateAudio = false,
  ): Promise<VideoResult> {
    const credentials = this.credentials;
    if (!credentials.seedanceApiKey) {
      throw new AppError('E_MODEL_API_FAILED', 'Seedance API Key 未配置');
    }
    return MODEL_LIMIT(() =>
      pRetry(
        async () => {
          const createResponse = await fetch(
            joinUrl(credentials.provider.seedanceBaseUrl, '/contents/generations/tasks'),
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${credentials.seedanceApiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                model: credentials.provider.seedanceModel,
                content,
                duration: durationSec,
                resolution,
                ratio,
                generate_audio: generateAudio,
                watermark: false,
              }),
            },
          );
          const created = await parseJson<ArkTaskResponse>(createResponse);
          const taskId = extractTaskId(created);
          const videoUrl = await this.pollVideoTask(taskId);
          await downloadFile(videoUrl, outputPath);
          return { localPath: outputPath, duration: durationSec };
        },
        { retries: 3, factor: 2 },
      ),
    );
  }

  private async pollVideoTask(taskId: string): Promise<string> {
    const started = Date.now();
    while (Date.now() - started < DEFAULT_POLL_TIMEOUT_MS) {
      const response = await fetch(
        joinUrl(this.credentials.provider.seedanceBaseUrl, `/contents/generations/tasks/${taskId}`),
        {
          headers: {
            Authorization: `Bearer ${this.credentials.seedanceApiKey ?? ''}`,
          },
        },
      );
      const data = await parseJson<ArkTaskResponse>(response);
      if (data.status === 'succeeded') {
        const videoUrl = extractVideoUrl(data);
        if (!videoUrl) {
          throw new AppError('E_MODEL_API_FAILED', 'Seedance 成功响应缺少 video_url');
        }
        return videoUrl;
      }
      if (data.status === 'failed' || data.status === 'expired') {
        throw new AppError('E_MODEL_API_FAILED', summarizeArkTaskFailure(data, taskId));
      }
      await sleep(DEFAULT_POLL_INTERVAL_MS);
    }
    throw new AppError('E_MODEL_API_FAILED', 'Seedance 任务轮询超时');
  }
}

export class VolcengineModelClientFactory {
  constructor(private readonly loadCredentials: RuntimeCredentialsLoader) {}

  async create(): Promise<ModelClient> {
    return new VolcengineModelClient(await this.loadCredentials());
  }
}
