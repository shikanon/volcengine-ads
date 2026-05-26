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

function run(command: ffmpeg.FfmpegCommand): Promise<void> {
  return new Promise((resolve, reject) => {
    command.on('end', () => resolve());
    command.on('error', (error) => {
      reject(new AppError('E_FFMPEG_FAILED', error.message, { cause: error }));
    });
    command.run();
  });
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

export async function concatWithFade(firstPath: string, secondPath: string, outputPath: string): Promise<string> {
  await mkdir(dirname(outputPath), { recursive: true });
  await run(
    ffmpeg()
      .input(firstPath)
      .input(secondPath)
      .complexFilter([
        '[0:v][1:v]xfade=transition=fade:duration=0.4:offset=0[v]',
        '[0:a][1:a]acrossfade=d=0.4[a]',
      ])
      .outputOptions(['-map [v]', '-map [a]', '-c:v libx264', '-c:a aac', '-movflags +faststart'])
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
  const inputs = videoPaths.map((_videoPath, index) => `[${index}:v][${index}:a]`).join('');
  await run(
    command
      .complexFilter([`${inputs}concat=n=${videoPaths.length}:v=1:a=1[v][a]`])
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
