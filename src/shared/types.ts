export type TaskType = 'explosion' | 'pretrailer' | 'avatar';
export type TaskStatus = 'queued' | 'running' | 'success' | 'failed' | 'paused';
export type StepStatus = 'pending' | 'running' | 'success' | 'failed' | 'skipped';
export type AssetKind = 'video' | 'audio' | 'image' | 'script' | 'report';

export interface TaskRecord {
  id: string;
  type: TaskType;
  status: TaskStatus;
  progress: number;
  input: ExplosionInput | PretrailerInput | AvatarInput;
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
  douyinUrl: string;
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
  llmConfigured: boolean;
  ttsConfigured: boolean;
  asrConfigured: boolean;
  concurrency: number;
  defaultPretrailerStyle: PretrailerStyle;
  complianceAccepted: boolean;
  provider: ProviderPublicSettings;
}

export interface ProviderPublicSettings {
  seedanceBaseUrl: string;
  seedanceModel: string;
  llmBaseUrl: string;
  llmModel: string;
  ttsBaseUrl: string;
  ttsVoice: string;
  asrBaseUrl: string;
}

export interface SettingsUpdate {
  seedanceApiKey?: string;
  llmApiKey?: string;
  ttsAppId?: string;
  ttsToken?: string;
  asrApiKey?: string;
  concurrency?: number;
  defaultPretrailerStyle?: PretrailerStyle;
  complianceAccepted?: boolean;
  provider?: Partial<ProviderPublicSettings>;
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
  input: ExplosionInput | PretrailerInput | AvatarInput;
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
