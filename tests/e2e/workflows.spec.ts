import { expect, test } from '@playwright/test';

import { WORKFLOW_DEFINITIONS } from '../../src/shared/workflows.js';

test('native workflow exposes all six-industry generation nodes', () => {
  expect(WORKFLOW_DEFINITIONS.native.nodes.map((node) => node.id)).toEqual([
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

test('copywriting workflow exposes requirement-to-script nodes', () => {
  expect(WORKFLOW_DEFINITIONS.copywriting.nodes.map((node) => node.id)).toEqual([
    'industry_router',
    'template_optimize',
    'web_research',
    'requirement_decompose',
    'strategy_analysis',
    'script_writer',
  ]);
});

test('video scoring workflow exposes ingest-to-report nodes', () => {
  expect(WORKFLOW_DEFINITIONS.video_scoring.nodes.map((node) => node.id)).toEqual([
    'ingest',
    'score',
    'report_writer',
  ]);
});

test('ecommerce image workflow exposes packaging nodes', () => {
  expect(WORKFLOW_DEFINITIONS.ecommerce_image.nodes.map((node) => node.id)).toEqual([
    'product_understand',
    'copy_generate',
    'main_image_beautify',
    'background_replace',
    'copy_render',
  ]);
});
