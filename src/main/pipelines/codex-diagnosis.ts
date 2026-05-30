import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { execa } from 'execa';

import type { AppError } from '../errors.js';
import type { TaskRecord } from '../../shared/types.js';
import { errorTypeLabel } from './task-log.js';

const CODEX_DIAGNOSIS_TIMEOUT_MS = 3 * 60 * 1000;

function diagnosisFileName(stepName: string): string {
  return `codex-diagnosis-${stepName.replace(/[^a-z0-9_-]/giu, '_')}.md`;
}

function buildCodexPrompt(params: {
  task: TaskRecord;
  stepName: string;
  logFilePath: string;
  artifactDir: string;
  error: AppError;
}): string {
  return [
    '你是 AIGC Ads Studio 的故障诊断助手。',
    '任务失败后系统会自动调用你一次；请只做只读诊断，不要修改、创建或删除项目源码，不要执行修复命令。',
    '请读取 pipeline.log 和同目录下相关 JSON / 媒体产物信息，定位最可能原因，给出可执行的修复建议。',
    '输出请使用中文 Markdown，包含：结论、证据、建议修复、可重试性判断。',
    '',
    `任务 ID：${params.task.id}`,
    `任务类型：${params.task.type}`,
    `失败节点：${params.stepName}`,
    `错误类型：${errorTypeLabel(params.error.code)}`,
    `错误信息：${params.error.message}`,
    params.error.detail !== undefined ? `错误详情：${params.error.detail}` : undefined,
    `日志文件：${params.logFilePath}`,
    `产物目录：${params.artifactDir}`,
  ]
    .filter((line): line is string => line !== undefined)
    .join('\n');
}

export async function runCodexDiagnosisOnce(params: {
  task: TaskRecord;
  stepName: string;
  artifactDir: string;
  logFilePath: string;
  error: AppError;
}): Promise<string | undefined> {
  if (process.env.VITEST !== undefined || process.env.NODE_ENV === 'test') {
    return undefined;
  }

  const diagnosisPath = join(params.artifactDir, diagnosisFileName(params.stepName));
  if (existsSync(diagnosisPath)) {
    return diagnosisPath;
  }

  await mkdir(dirname(diagnosisPath), { recursive: true });
  try {
    await execa(
      'codex',
      [
        'exec',
        '--cd',
        params.artifactDir,
        '--skip-git-repo-check',
        '--sandbox',
        'read-only',
        '--ask-for-approval',
        'never',
        '--output-last-message',
        diagnosisPath,
        buildCodexPrompt(params),
      ],
      {
        timeout: CODEX_DIAGNOSIS_TIMEOUT_MS,
        reject: true,
      },
    );
    return diagnosisPath;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await writeFile(
      diagnosisPath,
      [
        '# Codex 诊断未完成',
        '',
        '系统已在任务失败后自动调用 Codex CLI，但调用过程失败。',
        '',
        `失败原因：${message}`,
      ].join('\n'),
      'utf8',
    );
    return diagnosisPath;
  }
}
