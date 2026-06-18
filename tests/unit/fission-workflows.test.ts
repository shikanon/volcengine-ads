import { describe, expect, it } from 'vitest';

import {
  FISSION_MODE_DEFINITIONS,
  estimateFissionCombinations,
  sampleFissionCombinations,
  validateFissionCombinationInputs,
} from '../../src/shared/workflows.js';
import type { ExplosionFissionConfig } from '../../src/shared/types.js';

describe('industry fission workflow definitions', () => {
  it('defines ecommerce and short drama fission modes with ordered slots', () => {
    expect(FISSION_MODE_DEFINITIONS.pain_pretrailer.slots.map((slot) => slot.key)).toEqual([
      'pain_pretrailer',
      'product_highlight',
      'benefit_ending',
      'bgm',
    ]);
    expect(FISSION_MODE_DEFINITIONS.pretrailer_remix.slots.map((slot) => slot.key)).toEqual([
      'pretrailer',
      'highlight_1',
      'highlight_2',
      'bgm',
    ]);
  });

  it('estimates ecommerce pain pretrailer combinations with display formula', () => {
    const estimate = estimateFissionCombinations(
      'ecommerce',
      'pain_pretrailer',
      {
        pain_pretrailer: 5,
        product_highlight: 10,
        benefit_ending: 4,
        bgm: 3,
      },
      8,
    );

    expect(estimate.formula).toBe('5 × 10 × 4 × 3 = 600');
    expect(estimate.total).toBe(600);
    expect(estimate.sampleCount).toBe(8);
  });

  it('estimates short drama pretrailer remix combinations', () => {
    const estimate = estimateFissionCombinations(
      'short_drama',
      'pretrailer_remix',
      {
        pretrailer: 5,
        highlight_1: 10,
        highlight_2: 10,
        bgm: 3,
      },
      4,
    );

    expect(estimate.formula).toBe('5 × 10 × 10 × 3 = 1500');
    expect(estimate.total).toBe(1500);
    expect(estimate.sampleCount).toBe(4);
  });

  it('validates missing required slot with Chinese slot name', () => {
    const config: ExplosionFissionConfig = {
      industry: 'ecommerce',
      mode: 'pain_pretrailer',
      slotAssetPaths: {
        product_highlight: ['/tmp/product.mp4'],
        benefit_ending: ['/tmp/benefit.mp4'],
      },
      bgmPaths: ['/tmp/bgm.mp3'],
    };

    expect(validateFissionCombinationInputs(config, 3)).toEqual({
      valid: false,
      errors: ['缺少必填槽位素材：3秒痛点前贴'],
    });
  });

  it('normalizes empty asset paths and rejects zero sampling count', () => {
    const config: ExplosionFissionConfig = {
      industry: 'ecommerce',
      mode: 'pain_pretrailer',
      slotAssetPaths: {
        pain_pretrailer: ['  /tmp/pain.mp4  ', '   '],
        product_highlight: ['/tmp/product.mp4'],
        benefit_ending: ['/tmp/benefit.mp4'],
      },
      bgmPaths: ['/tmp/bgm.mp3'],
    };

    expect(validateFissionCombinationInputs(config, 0)).toEqual({
      valid: false,
      errors: ['裂变生成数量必须至少为 1'],
    });
    expect(sampleFissionCombinations(config, Number.NaN)).toEqual([]);
  });

  it('samples only variantCount diverse concrete combinations', () => {
    const config: ExplosionFissionConfig = {
      industry: 'ecommerce',
      mode: 'pain_pretrailer',
      slotAssetPaths: {
        pain_pretrailer: ['/tmp/pain-1.mp4', '/tmp/pain-2.mp4'],
        product_highlight: ['/tmp/product-1.mp4', '/tmp/product-2.mp4'],
        benefit_ending: ['/tmp/benefit-1.mp4'],
      },
      bgmPaths: ['/tmp/bgm-1.mp3', '/tmp/bgm-2.mp3'],
    };

    const samples = sampleFissionCombinations(config, 3);

    expect(samples).toHaveLength(3);
    expect(samples.map((sample) => sample.combinationIndex)).toEqual([0, 2, 5]);
    expect(samples[0]?.slots.map((slot) => slot.assetPath)).toEqual([
      '/tmp/pain-1.mp4',
      '/tmp/product-1.mp4',
      '/tmp/benefit-1.mp4',
      '/tmp/bgm-1.mp3',
    ]);
  });

  it('caps sampling count to available combinations', () => {
    const config: ExplosionFissionConfig = {
      industry: 'short_drama',
      mode: 'trend_remix',
      slotAssetPaths: {
        highlight_1: ['/tmp/highlight-1.mp4'],
        highlight_2: ['/tmp/highlight-2.mp4'],
        highlight_3: ['/tmp/highlight-3.mp4'],
      },
    };

    const estimate = estimateFissionCombinations(
      config.industry,
      config.mode,
      { highlight_1: 1, highlight_2: 1, highlight_3: 1 },
      10,
    );

    expect(estimate.total).toBe(1);
    expect(estimate.sampleCount).toBe(1);
    expect(sampleFissionCombinations(config, 10)).toHaveLength(1);
  });
});
