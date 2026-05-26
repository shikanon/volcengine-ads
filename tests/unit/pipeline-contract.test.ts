import { describe, expect, it } from 'vitest';

import { getStepNames } from '../../src/main/pipelines/index.js';
import {
  VIDEO_COMPOSITION_PROMPT,
  getDefaultWorkflowPrompts,
  type WorkflowPromptId,
} from '../../src/shared/workflows.js';

describe('pipeline step contracts', () => {
  it('keeps explosion steps aligned with spec.md §8.1', () => {
    expect(getStepNames('explosion')).toEqual([
      'download',
      'asr',
      'script_parse',
      'rewrite',
      'seedance',
      'audio_replace',
    ]);
  });

  it('keeps pretrailer steps aligned with spec.md §8.2', () => {
    expect(getStepNames('pretrailer')).toEqual([
      'ingest',
      'understand',
      'keyframe_pick',
      'copy_gen',
      'script_gen',
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
      'tts',
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
      'storyboard_builder',
      'compliance_pre',
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
});
