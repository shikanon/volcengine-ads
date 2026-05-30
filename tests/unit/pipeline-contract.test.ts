import { describe, expect, it } from 'vitest';

import { getStepNames } from '../../src/main/pipelines/index.js';
import {
  AD_CREATIVE_STRUCTURE_PROMPT,
  AD_MATERIAL_QUALITY_PROMPT,
  PRIVATE_REASONING_PROMPT,
  SEEDANCE_DIRECTOR_PROMPT,
  SEEDANCE_PROMPT_CARD_PROMPT,
  SEEDANCE_SINGLE_CALL_DURATION_PROMPT,
  SEEDANCE_VC_ROUTER_PROMPT,
  VIDEO_COMPOSITION_PROMPT,
  VIDEO_TEXT_STICKER_PROMPT,
  getDefaultWorkflowPrompts,
  type WorkflowPromptId,
} from '../../src/shared/workflows.js';
import {
  normalizeSeedanceGenerationDuration,
  splitDurationForSeedanceGeneration,
} from '../../src/main/pipelines/helpers.js';

describe('pipeline step contracts', () => {
  it('keeps explosion steps aligned with spec.md §8.1', () => {
    expect(getStepNames('explosion')).toEqual([
      'download',
      'asr',
      'script_parse',
      'rewrite',
      'script_confirm',
      'video_prompt_optimize',
      'seedance',
      'audio_replace',
    ]);
  });

  it('keeps pretrailer steps aligned with spec.md §8.2', () => {
    expect(getStepNames('pretrailer')).toEqual([
      'ingest',
      'understand',
      'copy_gen',
      'script_gen',
      'script_confirm',
      'video_prompt_optimize',
      'seedance',
      'tts',
      'mux_pretrailer',
      'concat',
    ]);
  });

  it('keeps avatar steps aligned with spec.md §8.3', () => {
    expect(getStepNames('avatar')).toEqual([
      'validate_avatar',
      'product_understand',
      'brand_parse',
      'script_gen',
      'script_confirm',
      'tts',
      'video_prompt_optimize',
      'seedance_avatar',
      'overlay',
      'postprocess',
    ]);
  });

  it('keeps native steps aligned with spec.md §3', () => {
    expect(getStepNames('native')).toEqual([
      'industry_router',
      'concept_planner',
      'script_writer',
      'script_confirm',
      'storyboard_builder',
      'compliance_pre',
      'video_prompt_optimize',
      'asset_generator',
      'consistency_checker',
      'composer',
    ]);
  });

  it('keeps composition guidance in video generation meta prompts', () => {
    const prompts = getDefaultWorkflowPrompts();
    const videoPromptIds: WorkflowPromptId[] = [
      'explosion.rewrite',
      'explosion.seedance',
      'pretrailer.script_gen',
      'pretrailer.seedance',
      'avatar.seedance_avatar',
      'native.storyboard_builder',
      'native.asset_generator',
    ];

    for (const id of videoPromptIds) {
      expect(prompts[id]).toContain(VIDEO_COMPOSITION_PROMPT);
    }
  });

  it('keeps ad creative and Seedance director guidance in generation prompts', () => {
    const prompts = getDefaultWorkflowPrompts();
    const creativePromptIds: WorkflowPromptId[] = [
      'explosion.script_parse',
      'explosion.rewrite',
      'explosion.seedance',
      'pretrailer.copy_gen',
      'pretrailer.script_gen',
      'pretrailer.seedance',
      'native.concept_plan',
      'native.script_writer',
      'native.storyboard_builder',
      'native.asset_generator',
    ];
    const seedancePromptIds: WorkflowPromptId[] = [
      'explosion.rewrite',
      'explosion.seedance',
      'pretrailer.script_gen',
      'pretrailer.seedance',
      'native.storyboard_builder',
      'native.asset_generator',
    ];
    const qualityPromptIds: WorkflowPromptId[] = [
      'explosion.rewrite',
      'explosion.seedance',
      'pretrailer.copy_gen',
      'pretrailer.script_gen',
      'pretrailer.seedance',
      'native.concept_plan',
      'native.storyboard_builder',
      'native.asset_generator',
    ];

    for (const id of creativePromptIds) {
      expect(prompts[id]).toContain(AD_CREATIVE_STRUCTURE_PROMPT);
    }
    for (const id of seedancePromptIds) {
      expect(prompts[id]).toContain(SEEDANCE_DIRECTOR_PROMPT);
    }
    for (const id of qualityPromptIds) {
      expect(prompts[id]).toContain(AD_MATERIAL_QUALITY_PROMPT);
    }
  });

  it('keeps text sticker guidance out of native video generation', () => {
    const prompts = getDefaultWorkflowPrompts();
    const nativeVideoPromptIds: WorkflowPromptId[] = [
      'native.storyboard_builder',
      'native.asset_generator',
    ];

    for (const id of nativeVideoPromptIds) {
      expect(prompts[id]).toContain(VIDEO_TEXT_STICKER_PROMPT);
    }
  });

  it('keeps video understanding prompts on full-video input instead of keyframes', () => {
    const prompts = getDefaultWorkflowPrompts();
    expect(prompts['explosion.script_parse']).toContain('直接观看完整广告视频');
    expect(prompts['pretrailer.understand']).toContain('直接观看完整广告视频');
    expect(prompts['pretrailer.understand']).toContain('禁止把视频抽帧成图片');
  });

  it('keeps VLM and LLM analysis private while emitting JSON only', () => {
    const prompts = getDefaultWorkflowPrompts();
    const privateReasoningPromptIds: WorkflowPromptId[] = [
      'explosion.script_parse',
      'explosion.rewrite',
      'pretrailer.understand',
      'pretrailer.copy_gen',
      'pretrailer.script_gen',
      'avatar.validate_avatar',
      'avatar.product_understand',
      'avatar.brand_parse',
      'avatar.script_gen',
      'native.concept_plan',
      'native.script_writer',
      'native.storyboard_builder',
      'native.consistency_checker',
    ];

    for (const id of privateReasoningPromptIds) {
      expect(prompts[id]).toContain(PRIVATE_REASONING_PROMPT);
      expect(prompts[id]).toContain('不要输出推理链');
      expect(prompts[id]).toContain('只输出');
    }
  });

  it('routes Seedance prompts through Vibe Creating and reference policy contracts', () => {
    const prompts = getDefaultWorkflowPrompts();
    const seedancePromptIds: WorkflowPromptId[] = [
      'explosion.seedance',
      'pretrailer.seedance',
      'avatar.seedance_avatar',
      'native.asset_generator',
    ];
    const storyboardPromptIds: WorkflowPromptId[] = [
      'explosion.rewrite',
      'pretrailer.script_gen',
      'native.storyboard_builder',
    ];

    for (const id of seedancePromptIds) {
      expect(prompts[id]).toContain(SEEDANCE_VC_ROUTER_PROMPT);
      expect(prompts[id]).toContain('参考素材');
    }
    for (const id of ['explosion.seedance', 'pretrailer.seedance', 'native.asset_generator'] as WorkflowPromptId[]) {
      expect(prompts[id]).toContain(SEEDANCE_PROMPT_CARD_PROMPT);
      expect(prompts[id]).toContain('referencePolicy');
    }
    for (const id of storyboardPromptIds) {
      expect(prompts[id]).toContain('visualAnchor');
      expect(prompts[id]).toContain('behaviorState');
      expect(prompts[id]).toContain('localTone');
      expect(prompts[id]).toContain('videoTheme');
    }
  });

  it('keeps single-call Seedance durations inside 4..15 seconds', () => {
    expect(normalizeSeedanceGenerationDuration(1)).toBe(4);
    expect(normalizeSeedanceGenerationDuration(16)).toBe(15);
    expect(splitDurationForSeedanceGeneration(1)).toEqual([4]);
    expect(splitDurationForSeedanceGeneration(16)).toEqual([12, 4]);
    expect(splitDurationForSeedanceGeneration(31)).toEqual([15, 12, 4]);
  });

  it('tells LLM-authored video segments to stay within the single-call duration range', () => {
    const prompts = getDefaultWorkflowPrompts();
    for (const id of [
      'explosion.rewrite',
      'native.script_writer',
      'native.storyboard_builder',
    ] as WorkflowPromptId[]) {
      expect(prompts[id]).toContain(SEEDANCE_SINGLE_CALL_DURATION_PROMPT);
      expect(prompts[id]).toContain('4-15 秒');
    }
    expect(prompts['pretrailer.script_gen']).toContain('单次 durationSec 使用 {pretrailerDuration}s');
    expect(prompts['avatar.script_gen']).toContain('4-15 秒单次调用范围切分');
  });
});
