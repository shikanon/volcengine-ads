import { copyFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';

import ffmpeg from 'fluent-ffmpeg';

import { AppError } from '../errors.js';

const require = createRequire(import.meta.url);
const ffmpegPath = require('ffmpeg-static') as string | null;

if (typeof ffmpegPath === 'string') {
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

export async function overlayProductImages(videoPath: string, outputPath: string): Promise<string> {
  await mkdir(dirname(outputPath), { recursive: true });
  await copyFile(videoPath, outputPath);
  return outputPath;
}
