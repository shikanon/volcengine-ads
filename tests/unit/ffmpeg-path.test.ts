import { describe, expect, it } from 'vitest';

import { resolveFfmpegBinaryPath } from '../../src/main/media/ffmpeg.js';

describe('resolveFfmpegBinaryPath', () => {
  it('uses electron-builder unpacked path when ffmpeg-static resolves inside app.asar', () => {
    expect(
      resolveFfmpegBinaryPath(
        '/Applications/AIGC Ads Studio.app/Contents/Resources/app.asar/node_modules/ffmpeg-static/ffmpeg',
      ),
    ).toBe(
      '/Applications/AIGC Ads Studio.app/Contents/Resources/app.asar.unpacked/node_modules/ffmpeg-static/ffmpeg',
    );
  });

  it('keeps development paths unchanged', () => {
    expect(resolveFfmpegBinaryPath('/repo/node_modules/ffmpeg-static/ffmpeg')).toBe(
      '/repo/node_modules/ffmpeg-static/ffmpeg',
    );
  });
});
