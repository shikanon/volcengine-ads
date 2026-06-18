import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { AppError } from '../../src/main/errors.js';
import { validateCreateTaskRequest } from '../../src/main/validation.js';
import { DEFAULT_VIDEO_RESOLUTION } from '../../src/shared/types.js';

describe('validateCreateTaskRequest', () => {
  it('accepts explosion input and applies variant count bounds', () => {
    expect(
      validateCreateTaskRequest({
        type: 'explosion',
        input: { douyinUrl: 'https://v.douyin.com/demo', variantCount: 3 },
      }),
    ).toEqual({
      type: 'explosion',
      input: {
        douyinUrl: 'https://v.douyin.com/demo',
        variantCount: 3,
        resolution: DEFAULT_VIDEO_RESOLUTION,
      },
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
      input: { sourceVideoPath, variantCount: 3, resolution: DEFAULT_VIDEO_RESOLUTION },
    });
  });

  it('accepts explicit task video resolution', () => {
    expect(
      validateCreateTaskRequest({
        type: 'explosion',
        input: { douyinUrl: 'https://v.douyin.com/demo', variantCount: 3, resolution: '1080p' },
      }),
    ).toEqual({
      type: 'explosion',
      input: { douyinUrl: 'https://v.douyin.com/demo', variantCount: 3, resolution: '1080p' },
    });
  });

  it('accepts explosion industry fission config and keeps default compatibility', () => {
    const dir = mkdtempSync(join(tmpdir(), 'volcengine-ads-'));
    const painPretrailer = join(dir, 'pain.mp4');
    const productHighlight = join(dir, 'product.mp4');
    const benefitEnding = join(dir, 'benefit.mp4');
    const bgm = join(dir, 'bgm.mp3');
    for (const path of [painPretrailer, productHighlight, benefitEnding, bgm]) {
      writeFileSync(path, 'asset');
    }

    expect(
      validateCreateTaskRequest({
        type: 'explosion',
        input: {
          douyinUrl: 'https://v.douyin.com/demo',
          variantCount: 3,
          fissionConfig: {
            industry: 'ecommerce',
            mode: 'pain_pretrailer',
            slotAssetPaths: {
              pain_pretrailer: [painPretrailer],
              product_highlight: [productHighlight],
              benefit_ending: [benefitEnding],
            },
            bgmPaths: [bgm],
          },
        },
      }),
    ).toEqual({
      type: 'explosion',
      input: {
        douyinUrl: 'https://v.douyin.com/demo',
        variantCount: 3,
        resolution: DEFAULT_VIDEO_RESOLUTION,
        fissionConfig: {
          industry: 'ecommerce',
          mode: 'pain_pretrailer',
          slotAssetPaths: {
            pain_pretrailer: [painPretrailer],
            product_highlight: [productHighlight],
            benefit_ending: [benefitEnding],
          },
          bgmPaths: [bgm],
        },
      },
    });
  });

  it('rejects explosion industry fission config with missing required slot', () => {
    const dir = mkdtempSync(join(tmpdir(), 'volcengine-ads-'));
    const productHighlight = join(dir, 'product.mp4');
    const benefitEnding = join(dir, 'benefit.mp4');
    const bgm = join(dir, 'bgm.mp3');
    for (const path of [productHighlight, benefitEnding, bgm]) {
      writeFileSync(path, 'asset');
    }

    expect(() =>
      validateCreateTaskRequest({
        type: 'explosion',
        input: {
          douyinUrl: 'https://v.douyin.com/demo',
          variantCount: 3,
          fissionConfig: {
            industry: 'ecommerce',
            mode: 'pain_pretrailer',
            slotAssetPaths: {
              product_highlight: [productHighlight],
              benefit_ending: [benefitEnding],
            },
            bgmPaths: [bgm],
          },
        },
      }),
    ).toThrowError(/缺少必填槽位素材：3秒痛点前贴/u);
  });

  it('rejects unsupported task video resolution', () => {
    const request = {
      type: 'explosion',
      input: { douyinUrl: 'https://v.douyin.com/demo', variantCount: 3, resolution: '540p' },
    } as unknown as Parameters<typeof validateCreateTaskRequest>[0];

    expect(() =>
      validateCreateTaskRequest(request),
    ).toThrow(AppError);
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

  it('accepts pretrailer video generation type input', () => {
    const dir = mkdtempSync(join(tmpdir(), 'volcengine-ads-'));
    const sourceVideoPath = join(dir, 'source.mp4');
    writeFileSync(sourceVideoPath, 'video');

    for (const style of ['giant_miniature', 'emotional_amplification'] as const) {
      expect(
        validateCreateTaskRequest({
          type: 'pretrailer',
          input: {
            sourceVideoPath,
            pretrailerDuration: 7,
            style,
          },
        }),
      ).toEqual({
        type: 'pretrailer',
        input: {
          sourceVideoPath,
          pretrailerDuration: 7,
          style,
          resolution: DEFAULT_VIDEO_RESOLUTION,
        },
      });
    }
  });

  it('accepts native industry generation input with optional reference assets', () => {
    const dir = mkdtempSync(join(tmpdir(), 'volcengine-ads-'));
    const referenceVideoPath = join(dir, 'reference.mp4');
    const referenceImagePath1 = join(dir, 'reference-1.png');
    const referenceImagePath2 = join(dir, 'reference-2.jpg');
    const referenceAudioPath = join(dir, 'reference.wav');
    writeFileSync(referenceVideoPath, 'video');
    writeFileSync(referenceImagePath1, 'image');
    writeFileSync(referenceImagePath2, 'image');
    writeFileSync(referenceAudioPath, 'audio');

    expect(
      validateCreateTaskRequest({
        type: 'native',
        input: {
          industry: 'tool',
          brief: '面向 AI 健康 APP 的新年营销短视频，突出每日健康提醒和轻量记录。',
          productName: 'AI 健康 APP',
          referenceVideoPath,
          referenceImagePaths: [referenceImagePath1, referenceImagePath2],
          referenceAudioPath,
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
        referenceImagePaths: [referenceImagePath1, referenceImagePath2],
        referenceAudioPath,
        variantCount: 2,
        durationSec: 15,
        ratio: '9:16',
        resolution: DEFAULT_VIDEO_RESOLUTION,
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

  it('rejects native reference images beyond Seedance limit', () => {
    const dir = mkdtempSync(join(tmpdir(), 'volcengine-ads-'));
    const referenceImagePaths = Array.from({ length: 10 }, (_, index) => {
      const path = join(dir, `reference-${index}.png`);
      writeFileSync(path, 'image');
      return path;
    });

    expect(() =>
      validateCreateTaskRequest({
        type: 'native',
        input: {
          industry: 'tool',
          brief: '工具类广告素材，使用多张商品图和场景图做稳定参考。',
          referenceImagePaths,
          variantCount: 1,
          durationSec: 15,
          ratio: '9:16',
        },
      }),
    ).toThrowError(/参考图片最多支持 9 张/u);
  });

  it('accepts ecommerce native industry generation input', () => {
    expect(
      validateCreateTaskRequest({
        type: 'native',
        input: {
          industry: 'ecommerce',
          brief: '电商商品信息流短视频，突出商品特写、使用场景、权益刺激和下单转化。',
          productName: '清洁喷雾',
          variantCount: 1,
          durationSec: 30,
          ratio: '9:16',
        },
      }),
    ).toEqual({
      type: 'native',
      input: {
        industry: 'ecommerce',
        brief: '电商商品信息流短视频，突出商品特写、使用场景、权益刺激和下单转化。',
        productName: '清洁喷雾',
        variantCount: 1,
        durationSec: 30,
        ratio: '9:16',
        resolution: DEFAULT_VIDEO_RESOLUTION,
      },
    });
  });

  it('accepts copywriting generation input', () => {
    expect(
      validateCreateTaskRequest({
        type: 'copywriting',
        input: {
          industry: 'auto',
          requirement: '为一款通勤保温杯写短视频广告脚本，突出轻量、保温和办公室使用场景。',
          productName: '轻量保温杯',
          audience: '一线城市通勤白领',
          platform: '抖音信息流',
          format: 'short_video',
          variantCount: 3,
          durationSec: 30,
        },
      }),
    ).toEqual({
      type: 'copywriting',
      input: {
        industry: 'auto',
        requirement: '为一款通勤保温杯写短视频广告脚本，突出轻量、保温和办公室使用场景。',
        productName: '轻量保温杯',
        audience: '一线城市通勤白领',
        platform: '抖音信息流',
        format: 'short_video',
        variantCount: 3,
        durationSec: 30,
        enableWebSearch: true,
      },
    });
  });

  it('accepts copywriting input without requirement and falls back to inferred brief', () => {
    expect(
      validateCreateTaskRequest({
        type: 'copywriting',
        input: {
          industry: 'auto',
          productName: '轻量保温杯',
          audience: '一线城市通勤白领',
          platform: '抖音信息流',
          format: 'short_video',
          variantCount: 3,
          durationSec: 30,
        },
      }),
    ).toEqual({
      type: 'copywriting',
      input: {
        industry: 'auto',
        productName: '轻量保温杯',
        audience: '一线城市通勤白领',
        platform: '抖音信息流',
        format: 'short_video',
        variantCount: 3,
        durationSec: 30,
        enableWebSearch: true,
      },
    });
  });

  it('normalizes blank copywriting requirement to undefined', () => {
    expect(
      validateCreateTaskRequest({
        type: 'copywriting',
        input: {
          industry: 'auto',
          requirement: '   ',
          productName: '轻量保温杯',
          format: 'short_video',
          variantCount: 3,
          durationSec: 30,
        },
      }),
    ).toEqual({
      type: 'copywriting',
      input: {
        industry: 'auto',
        productName: '轻量保温杯',
        format: 'short_video',
        variantCount: 3,
        durationSec: 30,
        enableWebSearch: true,
      },
    });
  });

  it('rejects unsupported copywriting script format', () => {
    const request = {
      type: 'copywriting',
      input: {
        requirement: '为一款通勤保温杯写短视频广告脚本，突出轻量、保温和办公室使用场景。',
        format: 'poster',
        variantCount: 3,
        durationSec: 30,
      },
    } as unknown as Parameters<typeof validateCreateTaskRequest>[0];

    expect(() => validateCreateTaskRequest(request)).toThrow(AppError);
  });

  it('rejects unsupported copywriting industry template', () => {
    const request = {
      type: 'copywriting',
      input: {
        industry: 'finance',
        requirement: '为一款通勤保温杯写短视频广告脚本，突出轻量、保温和办公室使用场景。',
        format: 'short_video',
        variantCount: 3,
        durationSec: 30,
      },
    } as unknown as Parameters<typeof validateCreateTaskRequest>[0];

    expect(() => validateCreateTaskRequest(request)).toThrow(AppError);
  });

  it('accepts video scoring input', () => {
    const dir = mkdtempSync(join(tmpdir(), 'volcengine-ads-'));
    const sourceVideoPath = join(dir, 'ad.mp4');
    writeFileSync(sourceVideoPath, 'video');

    expect(
      validateCreateTaskRequest({
        type: 'video_scoring',
        input: {
          sourceVideoPath,
          category: 'brand',
        },
      }),
    ).toEqual({
      type: 'video_scoring',
      input: {
        sourceVideoPath,
        category: 'brand',
      },
    });
  });

  it('rejects video scoring input when video file is missing', () => {
    expect(() =>
      validateCreateTaskRequest({
        type: 'video_scoring',
        input: {
          sourceVideoPath: '/tmp/not-found-ad.mp4',
          category: 'brand',
        },
      }),
    ).toThrow(AppError);
  });

  it('rejects unsupported video scoring category', () => {
    const dir = mkdtempSync(join(tmpdir(), 'volcengine-ads-'));
    const sourceVideoPath = join(dir, 'ad.mp4');
    writeFileSync(sourceVideoPath, 'video');
    const request = {
      type: 'video_scoring',
      input: {
        sourceVideoPath,
        category: 'ugc',
      },
    } as unknown as Parameters<typeof validateCreateTaskRequest>[0];

    expect(() => validateCreateTaskRequest(request)).toThrow(AppError);
  });

  it('accepts lark download input with optional absolute output directory', () => {
    expect(
      validateCreateTaskRequest({
        type: 'lark_download',
        input: {
          url: 'https://bytedance.larkoffice.com/wiki/WutgwjNvxienAqkVmwfc1sMZnqe',
          outputDir: '/tmp/lark-downloads',
        },
      }),
    ).toEqual({
      type: 'lark_download',
      input: {
        url: 'https://bytedance.larkoffice.com/wiki/WutgwjNvxienAqkVmwfc1sMZnqe',
        outputDir: '/tmp/lark-downloads',
      },
    });
  });

  it('rejects non-lark download url', () => {
    expect(() =>
      validateCreateTaskRequest({
        type: 'lark_download',
        input: {
          url: 'https://example.com/wiki/demo',
        },
      }),
    ).toThrow(AppError);
  });

  it('rejects blank lark download url', () => {
    expect(() =>
      validateCreateTaskRequest({
        type: 'lark_download',
        input: {
          url: '   ',
        },
      }),
    ).toThrow(AppError);
  });

  it('rejects relative lark download output directory', () => {
    expect(() =>
      validateCreateTaskRequest({
        type: 'lark_download',
        input: {
          url: 'https://bytedance.larkoffice.com/docx/abc123',
          outputDir: 'relative/path',
        },
      }),
    ).toThrow(AppError);
  });
});
