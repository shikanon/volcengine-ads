import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { AppError } from '../errors.js';
import { renderWorkflowPrompt } from '../../shared/workflows.js';
import type { WorkflowPromptId } from '../../shared/workflows.js';
import type { StepContext } from './types.js';

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
