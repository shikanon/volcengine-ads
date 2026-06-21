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

function errorUserCause(code: AppErrorCode): string {
  switch (code) {
    case 'E_INPUT_VALIDATION':
      return '输入素材或参数不符合当前工作流要求。';
    case 'E_MODEL_API_FAILED':
      return '云端模型接口返回失败、超时，或返回内容不符合预期。';
    case 'E_FFMPEG_FAILED':
      return '本地 FFmpeg 在转码、拼接或音视频合成时失败。';
    case 'E_DOWNLOAD_FAILED':
      return '素材链接不可访问、网络异常，或目标平台返回了不可下载资源。';
    case 'E_AVATAR_INVALID':
      return '数字人图片未满足正面、清晰、单人等生成要求。';
    case 'E_LOW_CONFIDENCE':
      return '模型对素材内容的理解置信度不足，继续生成可能偏离原片。';
    case 'E_CTA_LOST':
      return '文案改写后缺少关键卖点或转化引导。';
    case 'E_KEYSTORE_FAILED':
      return '系统钥匙串不可用，应用无法读取或保存本地密钥。';
    case 'E_TASK_NOT_FOUND':
      return '任务记录不存在，可能已被删除或本地数据未同步。';
    case 'E_TASK_STATE':
      return '当前任务状态不允许执行这个操作。';
  }
}

function errorUserSuggestion(code: AppErrorCode): string {
  switch (code) {
    case 'E_INPUT_VALIDATION':
      return '请检查输入链接、文件路径、时长、比例、行业类型和必填字段，修改后重新创建或重试任务。';
    case 'E_MODEL_API_FAILED':
      return '请先重试当前节点；若连续失败，请检查模型服务配置、网络连接、余额/权限，以及日志中的第三方接口返回。';
    case 'E_FFMPEG_FAILED':
      return '请确认源视频可正常播放且未被占用，必要时更换素材或降低分辨率后重试。';
    case 'E_DOWNLOAD_FAILED':
      return '请确认链接可访问、账号有权限、网络稳定；也可以先下载到本地后重新导入。';
    case 'E_AVATAR_INVALID':
      return '请更换为单人正脸、无遮挡、光线充足的高清图片后重试。';
    case 'E_LOW_CONFIDENCE':
      return '请更换更清晰、主体更明确的视频，或缩短素材后重新生成。';
    case 'E_CTA_LOST':
      return '请补充产品卖点、优惠信息或行动号召，再从失败节点重试。';
    case 'E_KEYSTORE_FAILED':
      return '请检查 macOS 钥匙串权限，允许应用访问后重试；如仍失败，请重新保存模型密钥。';
    case 'E_TASK_NOT_FOUND':
      return '请刷新任务列表；如果任务已删除，请重新创建任务。';
    case 'E_TASK_STATE':
      return '请刷新任务状态，等待当前操作结束后再重试。';
  }
}

export function formatErrorForUser(error: AppError, logFilePath: string): string {
  return [
    `任务执行失败：${error.message}`,
    `可能原因：${errorUserCause(error.code)}`,
    `建议处理：${errorUserSuggestion(error.code)}`,
    `错误类型：${errorTypeLabel(error.code)}`,
    `日志文件：${logFilePath}`,
  ].join('\n');
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
