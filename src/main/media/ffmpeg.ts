import { execFile } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';

import ffmpeg from 'fluent-ffmpeg';

import { AppError } from '../errors.js';

const require = createRequire(import.meta.url);
const rawFfmpegPath = require('ffmpeg-static') as string | null;

export function resolveFfmpegBinaryPath(binaryPath: string | null): string | undefined {
  if (typeof binaryPath !== 'string' || binaryPath.length === 0) {
    return undefined;
  }

  return binaryPath.replace(/([/\\])app\.asar([/\\])/u, '$1app.asar.unpacked$2');
}

const ffmpegPath = resolveFfmpegBinaryPath(rawFfmpegPath);

if (ffmpegPath !== undefined) {
  ffmpeg.setFfmpegPath(ffmpegPath);
}

interface MediaInfo {
  hasAudio: boolean;
  durationSec?: number;
  width?: number;
  height?: number;
}

export interface AudioConcatSegment {
  audioPath?: string;
  durationSec: number;
}

export type BgmComposeStrategy = 'mix' | 'replace';

export interface ComposeVideosWithBgmOptions {
  bgmPath?: string;
  strategy?: BgmComposeStrategy;
  bgmVolume?: number;
  sourceVolume?: number;
}

function run(command: ffmpeg.FfmpegCommand): Promise<void> {
  return new Promise((resolve, reject) => {
    command.on('end', () => resolve());
    command.on('error', (error) => {
      reject(new AppError('E_FFMPEG_FAILED', error.message, { cause: error }));
    });
    command.run();
  });
}

function readMediaInfo(inputPath: string): Promise<MediaInfo> {
  return new Promise((resolve, reject) => {
    execFile(
      ffmpegPath ?? 'ffmpeg',
      ['-hide_banner', '-i', inputPath],
      { windowsHide: true, maxBuffer: 1024 * 1024 * 4 },
      (_error, stdout, stderr) => {
        const output = `${stdout}\n${stderr}`;
        const durationMatch = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/u.exec(output);
        const durationSec =
          durationMatch?.[1] !== undefined &&
          durationMatch[2] !== undefined &&
          durationMatch[3] !== undefined
            ? Number(durationMatch[1]) * 3600 +
              Number(durationMatch[2]) * 60 +
              Number(durationMatch[3])
            : undefined;
        const hasAudio = /Stream #\d+:\d+(?:\[[^\]]+\])?(?:\([^)]+\))?: Audio:/u.test(output);
        const videoMatch = /Stream #\d+:\d+(?:\[[^\]]+\])?(?:\([^)]+\))?: Video:[^\n]*?,\s*(\d+)x(\d+)/u.exec(output);
        const width = videoMatch?.[1] !== undefined ? Number(videoMatch[1]) : undefined;
        const height = videoMatch?.[2] !== undefined ? Number(videoMatch[2]) : undefined;
        if (durationSec === undefined && !/Input #/u.test(output)) {
          reject(new AppError('E_FFMPEG_FAILED', `无法读取媒体信息：${inputPath}`));
          return;
        }
        resolve({
          hasAudio,
          ...(durationSec !== undefined ? { durationSec } : {}),
          ...(width !== undefined && height !== undefined ? { width, height } : {}),
        });
      },
    );
  });
}

function evenDimension(value: number): number {
  return Math.max(2, Math.floor(value / 2) * 2);
}

function targetVideoSize(primary: MediaInfo, fallback: MediaInfo): { width: number; height: number } {
  const width = primary.width ?? fallback.width;
  const height = primary.height ?? fallback.height;
  if (width === undefined || height === undefined) {
    throw new AppError('E_FFMPEG_FAILED', '无法读取视频尺寸，不能拼接视频');
  }
  return { width: evenDimension(width), height: evenDimension(height) };
}

function videoFilter(inputIndex: number, outputLabel: string, width: number, height: number): string {
  return `[${inputIndex}:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},fps=30,setsar=1,format=yuv420p,settb=AVTB,setpts=PTS-STARTPTS[${outputLabel}]`;
}

function concatTargetVideoSize(mediaInfos: MediaInfo[]): { width: number; height: number } {
  const primary = mediaInfos.find((mediaInfo) => mediaInfo.width !== undefined && mediaInfo.height !== undefined);
  if (primary?.width === undefined || primary.height === undefined) {
    throw new AppError('E_FFMPEG_FAILED', '无法读取视频尺寸，不能拼接视频');
  }
  return { width: evenDimension(primary.width), height: evenDimension(primary.height) };
}

function filterDuration(durationSec: number | undefined, fallbackDurationSec?: number): string {
  const value = durationSec ?? fallbackDurationSec;
  if (value === undefined || !Number.isFinite(value) || value <= 0) {
    throw new AppError('E_FFMPEG_FAILED', '无法读取视频时长，不能补静音音轨');
  }
  return Math.max(0.01, value).toFixed(3);
}

function audioFilter(
  inputIndex: number,
  mediaInfo: MediaInfo,
  outputLabel: string,
  fallbackDurationSec?: number,
): string {
  if (mediaInfo.hasAudio) {
    return `[${inputIndex}:a]aresample=48000,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,asetpts=PTS-STARTPTS[${outputLabel}]`;
  }
  return `anullsrc=channel_layout=stereo:sample_rate=48000,atrim=duration=${filterDuration(
    mediaInfo.durationSec,
    fallbackDurationSec,
  )},asetpts=PTS-STARTPTS[${outputLabel}]`;
}

export async function normalizeVideo(inputPath: string, outputPath: string): Promise<string> {
  await mkdir(dirname(outputPath), { recursive: true });
  await run(
    ffmpeg(inputPath)
      .outputOptions(['-c:v libx264', '-c:a aac', '-r 30', '-pix_fmt yuv420p', '-movflags +faststart'])
      .output(outputPath),
  );
  return outputPath;
}

export async function trimVideo(
  inputPath: string,
  outputPath: string,
  durationSec: number,
  videoFilter?: string,
): Promise<string> {
  await mkdir(dirname(outputPath), { recursive: true });
  const outputOptions = [
    '-t',
    String(durationSec),
    ...(videoFilter !== undefined ? ['-vf', videoFilter] : []),
    '-c:v libx264',
    '-c:a aac',
    '-pix_fmt yuv420p',
    '-movflags +faststart',
  ];
  await run(
    ffmpeg(inputPath)
      .outputOptions(outputOptions)
      .output(outputPath),
  );
  return outputPath;
}

export async function extractAudio(inputPath: string, outputPath: string): Promise<string> {
  await mkdir(dirname(outputPath), { recursive: true });
  await run(ffmpeg(inputPath).noVideo().outputOptions(['-c:a aac']).output(outputPath));
  return outputPath;
}

export async function transcodeAudioToMp3(inputPath: string, outputPath: string): Promise<string> {
  await mkdir(dirname(outputPath), { recursive: true });
  await run(
    ffmpeg(inputPath)
      .noVideo()
      .outputOptions(['-c:a libmp3lame', '-ar 24000', '-ac 1'])
      .output(outputPath),
  );
  return outputPath;
}

export async function transcodeAudioToWav(inputPath: string, outputPath: string): Promise<string> {
  await mkdir(dirname(outputPath), { recursive: true });
  await run(
    ffmpeg(inputPath)
      .audioCodec('pcm_s16le')
      .audioChannels(1)
      .audioFrequency(44100)
      .format('wav')
      .output(outputPath),
  );
  return outputPath;
}

export async function trimAudio(inputPath: string, outputPath: string, durationSec: number): Promise<string> {
  await mkdir(dirname(outputPath), { recursive: true });
  await run(
    ffmpeg(inputPath)
      .noVideo()
      .outputOptions(['-t', String(durationSec), '-c:a libmp3lame', '-ar 24000', '-ac 1'])
      .output(outputPath),
  );
  return outputPath;
}

export async function concatAudioSegments(
  segments: AudioConcatSegment[],
  outputPath: string,
): Promise<string> {
  if (segments.length === 0) {
    throw new AppError('E_INPUT_VALIDATION', '至少需要 1 段音频用于拼接');
  }
  await mkdir(dirname(outputPath), { recursive: true });
  const command = ffmpeg();
  const filters: string[] = [];
  let inputIndex = 0;
  for (const [segmentIndex, segment] of segments.entries()) {
    const duration = filterDuration(segment.durationSec);
    const label = `a${segmentIndex}`;
    if (segment.audioPath !== undefined) {
      command.input(segment.audioPath);
      filters.push(
        `[${inputIndex}:a]aresample=48000,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,apad=pad_dur=${duration},atrim=duration=${duration},asetpts=PTS-STARTPTS[${label}]`,
      );
      inputIndex += 1;
    } else {
      filters.push(
        `anullsrc=channel_layout=stereo:sample_rate=48000,atrim=duration=${duration},asetpts=PTS-STARTPTS[${label}]`,
      );
    }
  }
  const inputs = segments.map((_segment, index) => `[a${index}]`).join('');
  filters.push(`${inputs}concat=n=${segments.length}:v=0:a=1[a]`);
  await run(
    command
      .complexFilter(filters)
      .outputOptions(['-map [a]', '-c:a aac'])
      .output(outputPath),
  );
  return outputPath;
}

export async function extractFrames(inputPath: string, outputDir: string): Promise<string> {
  await mkdir(outputDir, { recursive: true });
  await run(ffmpeg(inputPath).outputOptions(['-vf fps=1']).output(`${outputDir}/frame_%04d.jpg`));
  return outputDir;
}

export async function replaceAudio(videoPath: string, audioPath: string, outputPath: string): Promise<string> {
  await mkdir(dirname(outputPath), { recursive: true });
  await run(
    ffmpeg()
      .input(videoPath)
      .input(audioPath)
      .outputOptions(['-map 0:v:0', '-map 1:a:0', '-c:v copy', '-c:a aac', '-shortest'])
      .output(outputPath),
  );
  return outputPath;
}

export async function muxAudioVideo(videoPath: string, audioPath: string, outputPath: string): Promise<string> {
  return replaceAudio(videoPath, audioPath, outputPath);
}

interface ConcatWithFadeOptions {
  fadeDurationSec?: number;
  firstDurationSec?: number;
}

function normalizeFadeDuration(durationSec: number | undefined): number {
  if (durationSec === undefined || !Number.isFinite(durationSec)) {
    return 0.4;
  }
  return Math.min(Math.max(durationSec, 0.1), 2);
}

function fadeOffset(firstDurationSec: number | undefined, fadeDurationSec: number): number {
  if (firstDurationSec === undefined || !Number.isFinite(firstDurationSec)) {
    return 0;
  }
  return Math.max(0, firstDurationSec - fadeDurationSec);
}

export async function concatWithFade(
  firstPath: string,
  secondPath: string,
  outputPath: string,
  options: ConcatWithFadeOptions = {},
): Promise<string> {
  await mkdir(dirname(outputPath), { recursive: true });
  const fadeDurationSec = normalizeFadeDuration(options.fadeDurationSec);
  const offsetSec = fadeOffset(options.firstDurationSec, fadeDurationSec);
  const [firstInfo, secondInfo] = await Promise.all([readMediaInfo(firstPath), readMediaInfo(secondPath)]);
  const { width, height } = targetVideoSize(secondInfo, firstInfo);
  await run(
    ffmpeg()
      .input(firstPath)
      .input(secondPath)
      .complexFilter([
        videoFilter(0, 'v0', width, height),
        videoFilter(1, 'v1', width, height),
        `[v0][v1]xfade=transition=fade:duration=${fadeDurationSec}:offset=${offsetSec},format=yuv420p[v]`,
        audioFilter(0, firstInfo, 'a0', options.firstDurationSec),
        audioFilter(1, secondInfo, 'a1'),
        `[a0][a1]acrossfade=d=${fadeDurationSec}[a]`,
      ])
      .outputOptions([
        '-map [v]',
        '-map [a]',
        '-c:v libx264',
        '-c:a aac',
        '-r 30',
        '-pix_fmt yuv420p',
        '-movflags +faststart',
      ])
      .output(outputPath),
  );
  return outputPath;
}

export async function concatVideos(videoPaths: string[], outputPath: string): Promise<string> {
  if (videoPaths.length === 0) {
    throw new AppError('E_INPUT_VALIDATION', '至少需要 1 段视频用于拼接');
  }
  await mkdir(dirname(outputPath), { recursive: true });
  const command = ffmpeg();
  for (const videoPath of videoPaths) {
    command.input(videoPath);
  }
  const mediaInfos = await Promise.all(videoPaths.map((videoPath) => readMediaInfo(videoPath)));
  const { width, height } = concatTargetVideoSize(mediaInfos);
  const filters = mediaInfos.flatMap((mediaInfo, index) => [
    videoFilter(index, `v${index}`, width, height),
    audioFilter(index, mediaInfo, `a${index}`),
  ]);
  const inputs = videoPaths.map((_videoPath, index) => `[v${index}][a${index}]`).join('');
  filters.push(`${inputs}concat=n=${videoPaths.length}:v=1:a=1[v][a]`);
  await run(
    command
      .complexFilter(filters)
      .outputOptions([
        '-map [v]',
        '-map [a]',
        '-c:v libx264',
        '-c:a aac',
        '-pix_fmt yuv420p',
        '-movflags +faststart',
      ])
      .output(outputPath),
  );
  return outputPath;
}

function normalizeVolume(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(Math.max(value, 0), 2);
}

async function applyBgm(
  videoPath: string,
  bgmPath: string,
  outputPath: string,
  options: ComposeVideosWithBgmOptions,
): Promise<string> {
  await mkdir(dirname(outputPath), { recursive: true });
  const strategy = options.strategy ?? 'mix';
  const bgmVolume = normalizeVolume(options.bgmVolume, strategy === 'replace' ? 1 : 0.25);
  const sourceVolume = normalizeVolume(options.sourceVolume, 1);
  const command = ffmpeg()
    .input(videoPath)
    .input(bgmPath);
  const filters =
    strategy === 'replace'
      ? [
          `[1:a]aresample=48000,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,volume=${bgmVolume},apad[a]`,
        ]
      : [
          `[0:a]aresample=48000,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,volume=${sourceVolume}[voice]`,
          `[1:a]aresample=48000,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,volume=${bgmVolume},apad[bgm]`,
          '[voice][bgm]amix=inputs=2:duration=first:dropout_transition=0[a]',
        ];
  await run(
    command
      .complexFilter(filters)
      .outputOptions([
        '-map 0:v:0',
        '-map [a]',
        '-c:v copy',
        '-c:a aac',
        '-shortest',
        '-movflags +faststart',
      ])
      .output(outputPath),
  );
  return outputPath;
}

export async function composeVideosWithBgm(
  videoPaths: string[],
  outputPath: string,
  options: ComposeVideosWithBgmOptions = {},
): Promise<string> {
  if (options.bgmPath === undefined) {
    return concatVideos(videoPaths, outputPath);
  }
  const concatPath = `${outputPath}.concat.mp4`;
  await concatVideos(videoPaths, concatPath);
  return applyBgm(concatPath, options.bgmPath, outputPath, options);
}

export async function concatSilentVideos(videoPaths: string[], outputPath: string): Promise<string> {
  if (videoPaths.length === 0) {
    throw new AppError('E_INPUT_VALIDATION', '至少需要 1 段视频用于拼接');
  }
  await mkdir(dirname(outputPath), { recursive: true });
  const command = ffmpeg();
  for (const videoPath of videoPaths) {
    command.input(videoPath);
  }
  const inputs = videoPaths.map((_videoPath, index) => `[${index}:v]`).join('');
  await run(
    command
      .complexFilter([`${inputs}concat=n=${videoPaths.length}:v=1:a=0[v]`])
      .outputOptions(['-map [v]', '-an', '-c:v libx264', '-pix_fmt yuv420p', '-movflags +faststart'])
      .output(outputPath),
  );
  return outputPath;
}

export async function overlayProductImages(
  videoPath: string,
  productImagePaths: string[],
  outputPath: string,
): Promise<string> {
  if (productImagePaths.length === 0) {
    throw new AppError('E_INPUT_VALIDATION', '至少需要 1 张产品图');
  }
  await mkdir(dirname(outputPath), { recursive: true });
  const command = ffmpeg().input(videoPath);
  const filters: string[] = [];
  let currentVideo = '0:v';
  productImagePaths.slice(0, 3).forEach((imagePath, index) => {
    command.input(imagePath);
    const scaled = `product${index}`;
    const output = `v${index}`;
    const start = 4 + index * 6;
    const end = start + 5;
    filters.push(`[${index + 1}:v]scale=320:-1[${scaled}]`);
    filters.push(
      `[${currentVideo}][${scaled}]overlay=W-w-48:H-h-96:enable='between(t,${start},${end})'[${output}]`,
    );
    currentVideo = output;
  });
  await run(
    command
      .complexFilter(filters)
      .outputOptions(['-map', `[${currentVideo}]`, '-map', '0:a?', '-c:v libx264', '-c:a copy', '-movflags +faststart'])
      .output(outputPath),
  );
  return outputPath;
}
