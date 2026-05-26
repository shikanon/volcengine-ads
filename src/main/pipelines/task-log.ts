import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

import type { AppError, AppErrorCode } from '../errors.js';

export type PipelineLogLevel = 'info' | 'warn' | 'error';

export interface PipelineLogEntry {
  taskId: string;
  step: string;
  level: PipelineLogLevel;
  message: string;
  code?: AppErrorCode;
  errorType?: string;
  detail?: string;
  stack?: string;
  cause?: string;
  data?: Record<string, unknown>;
}

export function errorTypeLabel(code: AppErrorCode): string {
  switch (code) {
    case 'E_INPUT_VALIDATION':
      return '输入参数不合法';
    case 'E_MODEL_API_FAILED':
      return '第三方云端模型接口失败';
    case 'E_FFMPEG_FAILED':
      return '本地视频处理失败';
    case 'E_DOWNLOAD_FAILED':
      return '素材下载失败';
    case 'E_AVATAR_INVALID':
      return '数字人图片校验失败';
    case 'E_LOW_CONFIDENCE':
      return '内容一致性/理解置信度不足';
    case 'E_CTA_LOST':
      return '文案改写缺失关键卖点';
    case 'E_KEYSTORE_FAILED':
      return '本地密钥访问失败';
    case 'E_TASK_NOT_FOUND':
      return '任务不存在';
    case 'E_TASK_STATE':
      return '任务状态不支持当前操作';
  }
}

export function formatErrorForUser(error: AppError, logFilePath: string): string {
  return `${error.message}\n错误类型：${errorTypeLabel(error.code)}\n日志文件：${logFilePath}`;
}

export function errorToLogFields(error: AppError): Pick<
  PipelineLogEntry,
  'code' | 'errorType' | 'detail' | 'stack' | 'cause'
> {
  const fields: Pick<PipelineLogEntry, 'code' | 'errorType' | 'detail' | 'stack' | 'cause'> = {
    code: error.code,
    errorType: errorTypeLabel(error.code),
  };
  if (error.detail !== undefined) {
    fields.detail = error.detail;
  }
  if (error.stack !== undefined) {
    fields.stack = error.stack;
  }
  if (error.cause !== undefined) {
    fields.cause =
      error.cause instanceof Error
        ? `${error.cause.name}: ${error.cause.message}`
        : String(error.cause);
  }
  return fields;
}

export async function appendPipelineLog(
  logFilePath: string,
  entry: PipelineLogEntry,
): Promise<void> {
  await mkdir(dirname(logFilePath), { recursive: true });
  await appendFile(logFilePath, `${JSON.stringify({ ts: new Date().toISOString(), ...entry })}\n`);
}
