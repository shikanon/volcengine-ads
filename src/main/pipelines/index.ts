import type { TaskType } from '../../shared/types.js';
import type { PipelineDefinition } from './types.js';
import { avatarPipeline } from './avatar/index.js';
import { copywritingPipeline } from './copywriting/index.js';
import { ecommerceImagePipeline } from './ecommerce-image/index.js';
import { explosionPipeline } from './explosion/index.js';
import { larkDownloadPipeline } from './lark-download/index.js';
import { nativePipeline } from './native/index.js';
import { pretrailerPipeline } from './pretrailer/index.js';
import { videoScoringPipeline } from './video-scoring/index.js';

const PIPELINES: Record<TaskType, PipelineDefinition> = {
  explosion: explosionPipeline,
  pretrailer: pretrailerPipeline,
  avatar: avatarPipeline,
  native: nativePipeline,
  copywriting: copywritingPipeline,
  video_scoring: videoScoringPipeline,
  ecommerce_image: ecommerceImagePipeline,
  lark_download: larkDownloadPipeline,
};

export function getPipeline(type: TaskType): PipelineDefinition {
  return PIPELINES[type];
}

export function getStepNames(type: TaskType): string[] {
  return getPipeline(type).steps.map((step) => step.name);
}
