import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, extname } from 'node:path';

import pLimit from 'p-limit';
import pRetry from 'p-retry';
import { fetch } from 'undici';

import { AppError } from '../errors.js';
import type { RuntimeCredentials } from '../secure/keystore.js';
import type {
  AudioResult,
  ChatMessage,
  ChatOptions,
  ModelClient,
  RuntimeCredentialsLoader,
  SeedanceAvatarRequest,
  SeedanceVideoRequest,
  TranscriptResult,
  VideoResult,
} from './index.js';

const MODEL_LIMIT = pLimit(2);
const DEFAULT_POLL_INTERVAL_MS = 5000;
const DEFAULT_POLL_TIMEOUT_MS = 600_000;

interface ArkTaskResponse {
  id?: string;
  task_id?: string;
  status?: string;
  content?: {
    video_url?: string;
  };
  video_url?: string;
  error?: {
    message?: string;
  };
}

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}

function contentTypeFor(path: string): string {
  const ext = extname(path).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.png') return 'image/png';
  if (ext === '.m4a') return 'audio/mp4';
  if (ext === '.mp3') return 'audio/mpeg';
  if (ext === '.mov') return 'video/quicktime';
  return 'video/mp4';
}

async function fileToDataUrl(path: string): Promise<string> {
  const bytes = await readFile(path);
  return `data:${contentTypeFor(path)};base64,${bytes.toString('base64')}`;
}

async function downloadFile(url: string, outputPath: string): Promise<void> {
  await mkdir(dirname(outputPath), { recursive: true });
  const response = await fetch(url);
  if (!response.ok) {
    throw new AppError('E_MODEL_API_FAILED', `下载模型结果失败：${response.status}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(outputPath, buffer);
}

async function parseJson<T>(response: Awaited<ReturnType<typeof fetch>>): Promise<T> {
  const body = (await response.text()) || '{}';
  if (!response.ok) {
    throw new AppError('E_MODEL_API_FAILED', `HTTP ${response.status}: ${body.slice(0, 300)}`);
  }
  return JSON.parse(body) as T;
}

function extractTaskId(data: ArkTaskResponse): string {
  const taskId = data.id ?? data.task_id;
  if (!taskId) {
    throw new AppError('E_MODEL_API_FAILED', '视频任务响应缺少 task id');
  }
  return taskId;
}

function extractVideoUrl(data: ArkTaskResponse): string | undefined {
  return data.content?.video_url ?? data.video_url;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export class VolcengineModelClient implements ModelClient {
  constructor(private readonly credentials: RuntimeCredentials) {}

  async generateVideo(req: SeedanceVideoRequest): Promise<VideoResult> {
    const content: Array<Record<string, unknown>> = [{ type: 'text', text: req.prompt }];
    if (req.refImagePaths) {
      for (const imagePath of req.refImagePaths) {
        content.push({
          type: 'image_url',
          image_url: { url: await fileToDataUrl(imagePath) },
          role: 'reference_image',
        });
      }
    }
    if (req.refVideoPath) {
      content.push({
        type: 'video_url',
        video_url: { url: await fileToDataUrl(req.refVideoPath) },
        role: 'reference_video',
      });
    }
    return this.submitAndDownloadVideo(content, req.outputPath, req.durationSec, req.resolution);
  }

  async generateDigitalHuman(req: SeedanceAvatarRequest): Promise<VideoResult> {
    const content = [
      {
        type: 'image_url',
        image_url: { url: await fileToDataUrl(req.avatarImagePath) },
        role: 'reference_image',
      },
      {
        type: 'audio_url',
        audio_url: { url: await fileToDataUrl(req.audioPath) },
        role: 'reference_audio',
      },
      {
        type: 'text',
        text: '基于参考音频驱动数字人口播，保持正面构图、自然唇形和轻微表情动作。',
      },
    ];
    return this.submitAndDownloadVideo(content, req.outputPath, req.durationSec, '1080x1920');
  }

  async asr(audioPath: string): Promise<TranscriptResult> {
    const credentials = this.credentials;
    if (!credentials.asrApiKey) {
      throw new AppError('E_MODEL_API_FAILED', 'ASR API Key 未配置');
    }
    return MODEL_LIMIT(() =>
      pRetry(
        async () => {
          const response = await fetch(joinUrl(credentials.provider.asrBaseUrl, '/api/v1/asr'), {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${credentials.asrApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              audio: await fileToDataUrl(audioPath),
              file_name: basename(audioPath),
            }),
          });
          return parseJson<TranscriptResult>(response);
        },
        { retries: 3, factor: 2 },
      ),
    );
  }

  async tts(text: string, voice: string): Promise<AudioResult> {
    const credentials = this.credentials;
    if (!credentials.ttsAppId || !credentials.ttsToken) {
      throw new AppError('E_MODEL_API_FAILED', 'TTS AppId 或 Token 未配置');
    }
    const outputPath = `${process.cwd()}/tmp/tts-${Date.now()}.mp3`;
    return MODEL_LIMIT(() =>
      pRetry(
        async () => {
          const response = await fetch(
            joinUrl(credentials.provider.ttsBaseUrl, '/api/v3/tts/unidirectional'),
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Api-App-Id': credentials.ttsAppId ?? '',
                'X-Api-Access-Key': credentials.ttsToken ?? '',
                'X-Api-Resource-Id': 'seed-tts-2.0',
              },
              body: JSON.stringify({
                user: { uid: 'volcengine_ads_local' },
                req_params: {
                  text,
                  speaker: voice,
                  audio_params: {
                    format: 'mp3',
                    sample_rate: 24000,
                    speech_rate: 0,
                    volume_rate: 0,
                    pitch_rate: 0,
                  },
                },
              }),
            },
          );
          const body = await response.text();
          if (!response.ok) {
            throw new AppError('E_MODEL_API_FAILED', `TTS HTTP ${response.status}`);
          }
          const chunks: Buffer[] = [];
          for (const line of body.split('\n')) {
            if (!line.trim()) continue;
            const data = JSON.parse(line) as { code?: number; data?: string; message?: string };
            if ((data.code === 0 || data.code === 3000) && data.data) {
              chunks.push(Buffer.from(data.data, 'base64'));
            } else if (data.code && data.code !== 3031 && !data.data) {
              throw new AppError('E_MODEL_API_FAILED', data.message ?? `TTS code ${data.code}`);
            }
          }
          if (chunks.length === 0) {
            throw new AppError('E_MODEL_API_FAILED', 'TTS 响应未包含音频');
          }
          await mkdir(dirname(outputPath), { recursive: true });
          await writeFile(outputPath, Buffer.concat(chunks));
          return { localPath: outputPath, duration: 0 };
        },
        { retries: 3, factor: 2 },
      ),
    );
  }

  async chat(messages: ChatMessage[], opts?: ChatOptions): Promise<string> {
    const credentials = this.credentials;
    if (!credentials.llmApiKey) {
      throw new AppError('E_MODEL_API_FAILED', 'LLM API Key 未配置');
    }
    return MODEL_LIMIT(() =>
      pRetry(
        async () => {
          const response = await fetch(joinUrl(credentials.provider.llmBaseUrl, '/chat/completions'), {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${credentials.llmApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: credentials.provider.llmModel,
              messages,
              temperature: opts?.temperature ?? 0.7,
              response_format: opts?.jsonSchema ? { type: 'json_object' } : undefined,
            }),
          });
          const data = await parseJson<{ choices?: Array<{ message?: { content?: string } }> }>(response);
          const content = data.choices?.[0]?.message?.content;
          if (!content) {
            throw new AppError('E_MODEL_API_FAILED', 'LLM 响应为空');
          }
          return content;
        },
        { retries: 3, factor: 2 },
      ),
    );
  }

  async vision(images: string[], prompt: string): Promise<string> {
    const content = [
      ...(
        await Promise.all(
          images.map(async (imagePath) => ({
            type: 'image_url',
            image_url: { url: await fileToDataUrl(imagePath) },
          })),
        )
      ),
      { type: 'text', text: prompt },
    ];
    return this.chat([{ role: 'user', content: JSON.stringify(content) }], { temperature: 0.2 });
  }

  private async submitAndDownloadVideo(
    content: Array<Record<string, unknown>>,
    outputPath: string,
    durationSec = 10,
    resolution = '1080x1920',
  ): Promise<VideoResult> {
    const credentials = this.credentials;
    if (!credentials.seedanceApiKey) {
      throw new AppError('E_MODEL_API_FAILED', 'Seedance API Key 未配置');
    }
    return MODEL_LIMIT(() =>
      pRetry(
        async () => {
          const createResponse = await fetch(
            joinUrl(credentials.provider.seedanceBaseUrl, '/contents/generations/tasks'),
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${credentials.seedanceApiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                model: credentials.provider.seedanceModel,
                content,
                duration: Math.max(4, Math.min(15, durationSec)),
                resolution,
                ratio: 'adaptive',
                generate_audio: false,
                watermark: false,
              }),
            },
          );
          const created = await parseJson<ArkTaskResponse>(createResponse);
          const taskId = extractTaskId(created);
          const videoUrl = await this.pollVideoTask(taskId);
          await downloadFile(videoUrl, outputPath);
          return { localPath: outputPath, duration: durationSec };
        },
        { retries: 3, factor: 2 },
      ),
    );
  }

  private async pollVideoTask(taskId: string): Promise<string> {
    const started = Date.now();
    while (Date.now() - started < DEFAULT_POLL_TIMEOUT_MS) {
      const response = await fetch(
        joinUrl(this.credentials.provider.seedanceBaseUrl, `/contents/generations/tasks/${taskId}`),
        {
          headers: {
            Authorization: `Bearer ${this.credentials.seedanceApiKey ?? ''}`,
          },
        },
      );
      const data = await parseJson<ArkTaskResponse>(response);
      if (data.status === 'succeeded') {
        const videoUrl = extractVideoUrl(data);
        if (!videoUrl) {
          throw new AppError('E_MODEL_API_FAILED', 'Seedance 成功响应缺少 video_url');
        }
        return videoUrl;
      }
      if (data.status === 'failed' || data.status === 'expired') {
        throw new AppError('E_MODEL_API_FAILED', data.error?.message ?? `Seedance ${data.status}`);
      }
      await sleep(DEFAULT_POLL_INTERVAL_MS);
    }
    throw new AppError('E_MODEL_API_FAILED', 'Seedance 任务轮询超时');
  }
}

export class VolcengineModelClientFactory {
  constructor(private readonly loadCredentials: RuntimeCredentialsLoader) {}

  async create(): Promise<ModelClient> {
    return new VolcengineModelClient(await this.loadCredentials());
  }
}
