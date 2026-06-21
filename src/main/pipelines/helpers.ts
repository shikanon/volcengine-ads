import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { AppError } from '../errors.js';
import { renderWorkflowPrompt } from '../../shared/workflows.js';
import type { WorkflowPromptId } from '../../shared/workflows.js';
import type { PipelineInput, StepContext, StepResult } from './types.js';
import type { TaskStep } from '../../shared/types.js';

export async function writeJson(path: string, value: unknown): Promise<string> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2), 'utf8');
  return path;
}

export async function writeText(path: string, value: string): Promise<string> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, value, 'utf8');
  return path;
}

export async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

export function artifactPath(artifactDir: string, name: string): string {
  return join(artifactDir, name);
}

export function resumeByFiles<TInput = PipelineInput>(
  artifactNames: string[],
): (ctx: StepContext<TInput>, step: TaskStep) => boolean {
  return (ctx, step) => {
    const paths = artifactNames.length > 0 ? artifactNames.map((name) => artifactPath(ctx.artifactDir, name)) : [];
    const artifactPaths = step.artifactPath === undefined ? paths : [step.artifactPath, ...paths];
    return artifactPaths.length > 0 && artifactPaths.every((path) => existsSync(path));
  };
}

export const SEEDANCE_MIN_GENERATION_DURATION_SEC = 4;
export const SEEDANCE_MAX_GENERATION_DURATION_SEC = 15;

export function normalizeSeedanceGenerationDuration(durationSec: number | undefined, fallback = 10): number {
  const value = durationSec === undefined || !Number.isFinite(durationSec) ? fallback : durationSec;
  return Math.min(
    SEEDANCE_MAX_GENERATION_DURATION_SEC,
    Math.max(SEEDANCE_MIN_GENERATION_DURATION_SEC, Math.round(value)),
  );
}

export function splitDurationForSeedanceGeneration(durationSec: number): number[] {
  const chunks: number[] = [];
  let remaining = Math.max(SEEDANCE_MIN_GENERATION_DURATION_SEC, Math.round(durationSec));
  while (remaining > SEEDANCE_MAX_GENERATION_DURATION_SEC) {
    const remainingAfterMax = remaining - SEEDANCE_MAX_GENERATION_DURATION_SEC;
    const current =
      remainingAfterMax > 0 && remainingAfterMax < SEEDANCE_MIN_GENERATION_DURATION_SEC
        ? SEEDANCE_MAX_GENERATION_DURATION_SEC -
          (SEEDANCE_MIN_GENERATION_DURATION_SEC - remainingAfterMax)
        : SEEDANCE_MAX_GENERATION_DURATION_SEC;
    chunks.push(current);
    remaining -= current;
  }
  if (remaining > 0) {
    chunks.push(normalizeSeedanceGenerationDuration(remaining));
  }
  return chunks;
}

export interface ReferencePolicyInput {
  hasReferenceVideo?: boolean;
  hasReferenceImages?: boolean;
  hasReferenceAudio?: boolean;
  hasProductImages?: boolean;
  hasAvatarImage?: boolean;
  purpose: string;
  noReferenceFallback?: string;
}

export interface SeedancePromptCardInput {
  outputGoal: string;
  ratio?: string;
  durationSec?: number;
  visualAnchor: string;
  behaviorState: string;
  localTone: string;
  videoTheme: string;
  referencePolicy: string;
  sourceText?: string | undefined;
  preservedConstraints?: string[];
  forbidden?: string[];
  repairHint?: string;
  segmentNote?: string | undefined;
}

export function buildReferencePolicyText(input: ReferencePolicyInput): string {
  const policies: string[] = [`本次生成目的：${input.purpose}。`];
  if (input.hasProductImages === true) {
    policies.push('商品图优先级最高：保持商品外观、颜色、包装轮廓和可读文字不变形。');
  }
  if (input.hasAvatarImage === true) {
    policies.push('人物/数字人参考图只参考五官、发型、年龄感、服装和可信气质，不复制背景。');
  }
  if (input.hasReferenceImages === true) {
    policies.push('参考图用于稳定人物、商品、场景或风格锚点，不扩写图片中不存在的品牌承诺。');
  }
  if (input.hasReferenceAudio === true) {
    policies.push('参考音频用于借节奏、语气、情绪或音效氛围，不直接复刻原音频内容，也不扩写音频里未表达的承诺。');
  }
  if (input.hasReferenceVideo === true) {
    policies.push('参考该视频的主体位置、动作节奏、镜头连续性和转场衔接，不复制具体人物身份、场景和画面。');
  }
  if (
    input.hasReferenceVideo !== true &&
    input.hasReferenceImages !== true &&
    input.hasReferenceAudio !== true &&
    input.hasProductImages !== true &&
    input.hasAvatarImage !== true
  ) {
    policies.push(input.noReferenceFallback ?? '本次没有可用参考素材，必须只基于脚本、分镜和任务上下文生成，不要声称参考了视频或图片。');
  }
  return policies.join('\n');
}

export function buildSeedancePromptCard(input: SeedancePromptCardInput): string {
  const lines = [
    `输出目标：${input.outputGoal}`,
    input.ratio !== undefined ? `画幅：${input.ratio}` : undefined,
    input.durationSec !== undefined ? `时长：${input.durationSec}s` : undefined,
    input.segmentNote,
    `visualAnchor：${input.visualAnchor}`,
    `behaviorState：${input.behaviorState}`,
    `localTone：${input.localTone}`,
    `videoTheme：${input.videoTheme}`,
    `referencePolicy：${input.referencePolicy}`,
    input.sourceText !== undefined ? `sourceText：${input.sourceText}` : undefined,
    `preservedConstraints：${(input.preservedConstraints ?? ['用户明确要求、对白、旁白、音乐、音效、画幅、时长、产品露出']).join('；')}`,
    `forbidden：${(input.forbidden ?? ['不要生成不可控文字、水印、错别字、虚假承诺、夸大功效、和参考视频过度相似的画面']).join('；')}`,
    `repairHint：${input.repairHint ?? '若首秒弱，优先把冲突动作或核心卖点提前到 0-1 秒；若参考不一致，明确对应参考素材只借什么。'}`,
  ];
  return lines.filter((line): line is string => typeof line === 'string' && line.length > 0).join('\n');
}

export function waitForScriptConfirmation(
  ctx: StepContext,
  artifactName: string,
  label: string,
): StepResult {
  const message = `${label}已生成，请确认脚本文案后继续后续生成。`;
  return {
    artifactPath: artifactPath(ctx.artifactDir, artifactName),
    logs: message,
    awaitingConfirmation: { message },
  };
}

export function workflowPrompt(
  ctx: StepContext,
  id: WorkflowPromptId,
  variables: Record<string, string | number> = {},
): string {
  return renderWorkflowPrompt(id, ctx.workflowPrompts, variables);
}

export function parseModelJson<T>(value: string, label: string): T {
  const withoutFence = value
    .trim()
    .replace(/^```(?:json)?\s*/iu, '')
    .replace(/\s*```$/u, '')
    .trim();
  const objectStart = withoutFence.indexOf('{');
  const arrayStart = withoutFence.indexOf('[');
  const starts = [objectStart, arrayStart].filter((index) => index >= 0);
  const start = starts.length > 0 ? Math.min(...starts) : 0;
  const end = Math.max(withoutFence.lastIndexOf('}'), withoutFence.lastIndexOf(']'));
  const jsonText = end >= start ? withoutFence.slice(start, end + 1) : withoutFence;
  try {
    return JSON.parse(jsonText) as T;
  } catch (error) {
    throw new AppError('E_MODEL_API_FAILED', `${label} 不是合法 JSON`, { cause: error });
  }
}
