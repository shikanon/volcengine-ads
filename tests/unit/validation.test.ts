import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { AppError } from '../../src/main/errors.js';
import { validateCreateTaskRequest } from '../../src/main/validation.js';

describe('validateCreateTaskRequest', () => {
  it('accepts explosion input and applies variant count bounds', () => {
    expect(
      validateCreateTaskRequest({
        type: 'explosion',
        input: { douyinUrl: 'https://v.douyin.com/demo', variantCount: 3 },
      }),
    ).toEqual({
      type: 'explosion',
      input: { douyinUrl: 'https://v.douyin.com/demo', variantCount: 3 },
    });
  });

  it('accepts local explosion source video instead of douyin url', () => {
    const dir = mkdtempSync(join(tmpdir(), 'volcengine-ads-'));
    const sourceVideoPath = join(dir, 'source.mp4');
    writeFileSync(sourceVideoPath, '');

    expect(
      validateCreateTaskRequest({
        type: 'explosion',
        input: { sourceVideoPath, variantCount: 3 },
      }),
    ).toEqual({
      type: 'explosion',
      input: { sourceVideoPath, variantCount: 3 },
    });
  });

  it('rejects explosion input with both douyin url and local video', () => {
    const dir = mkdtempSync(join(tmpdir(), 'volcengine-ads-'));
    const sourceVideoPath = join(dir, 'source.mp4');
    writeFileSync(sourceVideoPath, '');

    expect(() =>
      validateCreateTaskRequest({
        type: 'explosion',
        input: { douyinUrl: 'https://v.douyin.com/demo', sourceVideoPath, variantCount: 3 },
      }),
    ).toThrow(AppError);
  });

  it('rejects explosion variant count above 10', () => {
    expect(() =>
      validateCreateTaskRequest({
        type: 'explosion',
        input: { douyinUrl: 'https://v.douyin.com/demo', variantCount: 11 },
      }),
    ).toThrow(AppError);
  });

  it('accepts native industry generation input with an optional reference video', () => {
    const dir = mkdtempSync(join(tmpdir(), 'volcengine-ads-'));
    const referenceVideoPath = join(dir, 'reference.mp4');
    writeFileSync(referenceVideoPath, 'video');

    expect(
      validateCreateTaskRequest({
        type: 'native',
        input: {
          industry: 'tool',
          brief: '面向 AI 健康 APP 的新年营销短视频，突出每日健康提醒和轻量记录。',
          productName: 'AI 健康 APP',
          referenceVideoPath,
          variantCount: 2,
          durationSec: 15,
          ratio: '9:16',
        },
      }),
    ).toEqual({
      type: 'native',
      input: {
        industry: 'tool',
        brief: '面向 AI 健康 APP 的新年营销短视频，突出每日健康提醒和轻量记录。',
        productName: 'AI 健康 APP',
        referenceVideoPath,
        variantCount: 2,
        durationSec: 15,
        ratio: '9:16',
      },
    });
  });

  it('rejects native short drama duration outside industry bounds', () => {
    expect(() =>
      validateCreateTaskRequest({
        type: 'native',
        input: {
          industry: 'short_drama',
          brief: '短剧投放素材，包含三秒冲突和悬念留白。',
          variantCount: 1,
          durationSec: 301,
          ratio: '9:16',
        },
      }),
    ).toThrow(AppError);
  });
});
