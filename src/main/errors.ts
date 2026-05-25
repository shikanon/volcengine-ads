export type AppErrorCode =
  | 'E_INPUT_VALIDATION'
  | 'E_DOWNLOAD_FAILED'
  | 'E_MODEL_API_FAILED'
  | 'E_FFMPEG_FAILED'
  | 'E_AVATAR_INVALID'
  | 'E_LOW_CONFIDENCE'
  | 'E_CTA_LOST'
  | 'E_KEYSTORE_FAILED'
  | 'E_TASK_NOT_FOUND'
  | 'E_TASK_STATE';

const DEFAULT_MESSAGES: Record<AppErrorCode, string> = {
  E_INPUT_VALIDATION: '输入参数不合法',
  E_DOWNLOAD_FAILED: '视频下载失败，请检查链接或网络',
  E_MODEL_API_FAILED: '云端服务暂不可用，请稍后重试',
  E_FFMPEG_FAILED: '本地视频处理失败，请重试',
  E_AVATAR_INVALID: '数字人图片需为正面、清晰、单人，请重选',
  E_LOW_CONFIDENCE: '视频内容理解置信度不足，请更换素材或重试',
  E_CTA_LOST: '文案重写丢失关键卖点，请重试',
  E_KEYSTORE_FAILED: '本地密钥访问失败，请检查系统钥匙串权限',
  E_TASK_NOT_FOUND: '任务不存在',
  E_TASK_STATE: '当前任务状态不支持该操作',
};

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly detail?: string;

  constructor(code: AppErrorCode, detail?: string, options?: ErrorOptions) {
    super(detail ? `${DEFAULT_MESSAGES[code]}：${detail}` : DEFAULT_MESSAGES[code], options);
    this.name = 'AppError';
    this.code = code;
    if (detail !== undefined) {
      this.detail = detail;
    }
  }
}

export function toAppError(error: unknown, fallback: AppErrorCode): AppError {
  if (error instanceof AppError) {
    return error;
  }
  if (error instanceof Error) {
    return new AppError(fallback, error.message, { cause: error });
  }
  return new AppError(fallback, String(error));
}
