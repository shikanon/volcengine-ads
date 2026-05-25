import type { WorkflowPromptOverrides } from './workflows.js';

export type TaskType = 'explosion' | 'pretrailer' | 'avatar' | 'native';
export type TaskStatus = 'queued' | 'running' | 'success' | 'failed' | 'paused' | 'canceled';
export type StepStatus = 'pending' | 'running' | 'success' | 'failed' | 'skipped' | 'canceled';
export type AssetKind = 'video' | 'audio' | 'image' | 'script' | 'report';
export type NativeIndustry = 'game' | 'short_drama' | 'novel' | 'social' | 'tool';
export type NativeRatio = '9:16' | '16:9' | '1:1';

export interface TaskRecord {
  id: string;
  type: TaskType;
  status: TaskStatus;
  progress: number;
  input: ExplosionInput | PretrailerInput | AvatarInput | NativeInput;
  error?: string;
  createdAt: number;
  updatedAt: number;
  steps: TaskStep[];
}

export interface TaskStep {
  id: string;
  step: string;
  status: StepStatus;
  artifactPath?: string;
  logs?: string;
  startedAt?: number;
  finishedAt?: number;
}

export interface ExplosionInput {
  douyinUrl?: string;
  sourceVideoPath?: string;
  variantCount: number;
}

export type PretrailerStyle = 'auto' | 'suspense' | 'contrast' | 'pain' | 'benefit';

export interface PretrailerInput {
  sourceVideoPath: string;
  pretrailerDuration: number;
  style: PretrailerStyle;
}

export interface AvatarInput {
  avatarImagePath: string;
  brandIntro: string;
  productImagePaths: string[];
  duration: number;
}

export interface NativeInput {
  industry: NativeIndustry;
  brief: string;
  productName?: string;
  referenceVideoPath?: string;
  variantCount: number;
  durationSec: number;
  ratio: NativeRatio;
}

export interface AssetRecord {
  id: string;
  taskId?: string;
  kind: AssetKind;
  path: string;
  thumbnail?: string;
  duration?: number;
  tags: string[];
  createdAt: number;
}

export interface AvatarRecord {
  id: string;
  name: string;
  imagePath: string;
  source: 'builtin' | 'user';
}

export interface SettingsState {
  seedanceConfigured: boolean;
  imageConfigured: boolean;
  llmConfigured: boolean;
  ttsConfigured: boolean;
  asrConfigured: boolean;
  seedanceApiKey?: string;
  imageApiKey?: string;
  llmApiKey?: string;
  ttsAppId?: string;
  ttsToken?: string;
  asrApiKey?: string;
  asrAppId?: string;
  asrToken?: string;
  ossAccessKeyId?: string;
  ossAccessKeySecret?: string;
  concurrency: number;
  defaultPretrailerStyle: PretrailerStyle;
  complianceAccepted: boolean;
  provider: ProviderPublicSettings;
  workflowPrompts: WorkflowPromptOverrides;
}

export interface ProviderPublicSettings {
  seedanceBaseUrl: string;
  seedanceModel: string;
  imageBaseUrl: string;
  imageModel: string;
  llmBaseUrl: string;
  llmModel: string;
  ttsBaseUrl: string;
  ttsVoice: string;
  asrBaseUrl: string;
  asrResourceId: string;
  ossEndpoint: string;
  ossBucketName: string;
}

export interface SettingsUpdate {
  seedanceApiKey?: string;
  imageApiKey?: string;
  llmApiKey?: string;
  ttsAppId?: string;
  ttsToken?: string;
  asrApiKey?: string;
  asrAppId?: string;
  asrToken?: string;
  ossAccessKeyId?: string;
  ossAccessKeySecret?: string;
  concurrency?: number;
  defaultPretrailerStyle?: PretrailerStyle;
  complianceAccepted?: boolean;
  provider?: Partial<ProviderPublicSettings>;
  workflowPrompts?: WorkflowPromptOverrides;
}

export interface TaskProgressEvent {
  taskId: string;
  status: TaskStatus;
  progress: number;
  step?: string;
  message?: string;
}

export interface CreateTaskRequest {
  type: TaskType;
  input: ExplosionInput | PretrailerInput | AvatarInput | NativeInput;
}

export interface RetryStepRequest {
  taskId: string;
  stepId: string;
}

export interface OpenPathRequest {
  path: string;
}

export interface PickFileRequest {
  filters: Array<{ name: string; extensions: string[] }>;
  multi?: boolean;
}
