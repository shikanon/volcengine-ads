import type { TaskType } from '../../shared/types.js';
import type { PipelineDefinition } from './types.js';
import { avatarPipeline } from './avatar/index.js';
import { explosionPipeline } from './explosion/index.js';
import { nativePipeline } from './native/index.js';
import { pretrailerPipeline } from './pretrailer/index.js';

const PIPELINES: Record<TaskType, PipelineDefinition> = {
  explosion: explosionPipeline,
  pretrailer: pretrailerPipeline,
  avatar: avatarPipeline,
  native: nativePipeline,
};

export function getPipeline(type: TaskType): PipelineDefinition {
  return PIPELINES[type];
}

export function getStepNames(type: TaskType): string[] {
  return getPipeline(type).steps.map((step) => step.name);
}
