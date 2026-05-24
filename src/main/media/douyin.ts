import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { execa } from 'execa';

import { AppError } from '../errors.js';
import { extractAudio } from './ffmpeg.js';

export interface DouyinDownloadResult {
  sourceVideoPath: string;
  sourceAudioPath: string;
  metaPath: string;
}

function resolveYtDlpPath(): string {
  const platformBinary = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
  return join(process.resourcesPath, 'bin', platformBinary);
}

export async function downloadDouyinVideo(url: string, artifactDir: string): Promise<DouyinDownloadResult> {
  const sourceVideoPath = join(artifactDir, 'source.mp4');
  const sourceAudioPath = join(artifactDir, 'source.m4a');
  const metaPath = join(artifactDir, 'meta.json');
  await mkdir(dirname(sourceVideoPath), { recursive: true });
  try {
    await execa(resolveYtDlpPath(), ['-o', sourceVideoPath, '--no-playlist', url]);
    await extractAudio(sourceVideoPath, sourceAudioPath);
    return { sourceVideoPath, sourceAudioPath, metaPath };
  } catch (error) {
    throw new AppError('E_DOWNLOAD_FAILED', undefined, { cause: error });
  }
}
