import { expect, test } from '@playwright/test';

import { WORKFLOW_DEFINITIONS } from '../../src/shared/workflows.js';

test('native workflow exposes all five-industry generation nodes', () => {
  expect(WORKFLOW_DEFINITIONS.native.nodes.map((node) => node.id)).toEqual([
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
