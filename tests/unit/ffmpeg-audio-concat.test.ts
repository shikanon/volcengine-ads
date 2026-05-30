import { execFile } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { access } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { concatAudioSegments, concatVideos, concatWithFade } from '../../src/main/media/ffmpeg.js';

const require = createRequire(import.meta.url);
const rawFfmpegPath = require('ffmpeg-static') as string | null;
const ffmpegBinaryPath = rawFfmpegPath ?? 'ffmpeg';

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(ffmpegBinaryPath, args, { windowsHide: true }, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

async function createSilentVideo(outputPath: string): Promise<void> {
  await runFfmpeg([
    '-y',
    '-f',
    'lavfi',
    '-i',
    'testsrc=size=64x64:rate=10:duration=0.5',
    '-an',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    outputPath,
  ]);
}

async function createVideoWithAudio(outputPath: string): Promise<void> {
  await runFfmpeg([
    '-y',
    '-f',
    'lavfi',
    '-i',
    'testsrc=size=64x64:rate=10:duration=0.5',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=880:duration=0.5',
    '-shortest',
    '-c:v',
    'libx264',
    '-c:a',
    'aac',
    '-pix_fmt',
    'yuv420p',
    outputPath,
  ]);
}

async function createAudio(outputPath: string): Promise<void> {
  await runFfmpeg([
    '-y',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440:duration=0.25',
    '-c:a',
    'libmp3lame',
    outputPath,
  ]);
}

describe('ffmpeg audio-tolerant video composition', () => {
  it('concats videos when one segment has no audio stream', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ffmpeg-audio-concat-'));
    const silentPath = join(dir, 'silent.mp4');
    const audioPath = join(dir, 'audio.mp4');
    const outputPath = join(dir, 'concat.mp4');
    await createSilentVideo(silentPath);
    await createVideoWithAudio(audioPath);

    await expect(concatVideos([silentPath, audioPath], outputPath)).resolves.toBe(outputPath);
    await expect(access(outputPath)).resolves.toBeUndefined();
  });

  it('fades videos when the source segment has no audio stream', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ffmpeg-audio-fade-'));
    const pretrailerPath = join(dir, 'pretrailer.mp4');
    const sourcePath = join(dir, 'source.mp4');
    const outputPath = join(dir, 'fade.mp4');
    await createVideoWithAudio(pretrailerPath);
    await createSilentVideo(sourcePath);

    await expect(
      concatWithFade(pretrailerPath, sourcePath, outputPath, { firstDurationSec: 0.5 }),
    ).resolves.toBe(outputPath);
    await expect(access(outputPath)).resolves.toBeUndefined();
  });

  it('concats TTS audio segments with silent gaps', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ffmpeg-tts-track-'));
    const voicePath = join(dir, 'voice.mp3');
    const outputPath = join(dir, 'track.m4a');
    await createAudio(voicePath);

    await expect(
      concatAudioSegments(
        [
          { audioPath: voicePath, durationSec: 0.5 },
          { durationSec: 0.5 },
        ],
        outputPath,
      ),
    ).resolves.toBe(outputPath);
    await expect(access(outputPath)).resolves.toBeUndefined();
  });
});
