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
