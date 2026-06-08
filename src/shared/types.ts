import type { WorkflowPromptOverrides } from './workflows.js';

export type TaskType =
  | 'explosion'
  | 'pretrailer'
  | 'avatar'
  | 'native'
  | 'copywriting'
  | 'lark_download';
export type TaskStatus =
  | 'queued'
  | 'running'
  | 'success'
  | 'failed'
  | 'paused'
  | 'canceled'
  | 'waiting_confirmation';
export type StepStatus =
  | 'pending'
  | 'running'
  | 'success'
  | 'failed'
  | 'skipped'
  | 'canceled'
  | 'waiting_confirmation';
export type AssetKind = 'video' | 'audio' | 'image' | 'script' | 'report';
export type NativeIndustry = 'game' | 'short_drama' | 'novel' | 'social' | 'tool' | 'ecommerce';
export type NativeRatio = '9:16' | '16:9' | '1:1';
export type VideoResolution = '480p' | '720p' | '1080p';
export type CopywritingScriptFormat = 'short_video' | 'feed_ad' | 'live_stream';
export type CopywritingIndustry = NativeIndustry | 'auto';
export type LarkDocumentType = 'wiki' | 'docx';

export const DEFAULT_VIDEO_RESOLUTION: VideoResolution = '720p';

export const VIDEO_RESOLUTION_OPTIONS: Array<{ value: VideoResolution; label: string }> = [
  { value: '480p', label: '480P' },
  { value: '720p', label: '720P' },
  { value: '1080p', label: '1080P' },
];

export const COPYWRITING_SCRIPT_FORMAT_DEFINITIONS: Array<{
  value: CopywritingScriptFormat;
  label: string;
  description: string;
}> = [
  {
    value: 'short_video',
    label: '短视频脚本',
    description: '适合信息流短视频、达人口播、AIGC 视频生成前的脚本文案。',
  },
  {
    value: 'feed_ad',
    label: '信息流文案',
    description: '适合图文卡片、落地页首屏、广告素材标题和正文组合。',
  },
  {
    value: 'live_stream',
    label: '直播口播',
    description: '适合直播间开场、产品讲解、权益节奏和逼单话术。',
  },
];

export const SUPPORTED_TTS_SPEAKERS = [
  'zh_female_vv_uranus_bigtts',
  'saturn_zh_female_cancan_tob',
  'saturn_zh_female_keainvsheng_tob',
  'saturn_zh_female_tiaopigongzhu_tob',
  'saturn_zh_male_shuanglangshaonian_tob',
  'saturn_zh_male_tiancaitongzhuo_tob',
  'zh_female_xiaohe_uranus_bigtts',
  'zh_male_m191_uranus_bigtts',
  'zh_male_taocheng_uranus_bigtts',
  'en_male_tim_uranus_bigtts',
] as const;

export type TtsSpeaker = (typeof SUPPORTED_TTS_SPEAKERS)[number];

export interface TaskRecord {
  id: string;
  type: TaskType;
  status: TaskStatus;
  progress: number;
  input:
    | ExplosionInput
    | PretrailerInput
    | AvatarInput
    | NativeInput
    | CopywritingInput
    | LarkDownloadInput;
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
  resolution?: VideoResolution;
}

export const PRETRAILER_VIDEO_TYPE_DEFINITIONS = [
  {
    value: 'benefit',
    label: '利益点前贴',
    promptTemplate:
      '利益点前贴：开场直接放大用户能感知的核心收益，围绕产品卖点、用户痛点和结果变化组织钩子，让观众在 1 秒内知道继续看能获得什么。',
  },
  {
    value: 'asmr',
    label: 'ASMR前贴',
    promptTemplate:
      'ASMR前贴：采用 AI 切万物 ASMR 的创意，把产品、场景或痛点具象化为可被切割、剥开、压碎或爆开的物体；搭配清脆、治愈的 ASMR 切割声、万物爆炸声和近距离细节镜头，形成强感官钩子。',
  },
  {
    value: 'curiosity',
    label: '猎奇前贴',
    promptTemplate:
      '猎奇前贴：用反常识、罕见现象或不寻常物件制造强烈好奇心，但画面仍要围绕产品价值服务，避免只追求怪异而脱离原广告。',
  },
  {
    value: 'surreal',
    label: '超现实前贴',
    promptTemplate:
      '超现实前贴：利用 AIGC 生成现实中难以出现的奇观、尺度变化、空间错位或物理反常画面，以视觉冲击力吸引用户，并保持原片色调和产品识别度。',
  },
  {
    value: 'giant_miniature',
    label: '巨物/微型前贴',
    promptTemplate:
      '巨物/微型前贴：把日常物体生成巨大尺度，例如比楼房还高的玉米、牙膏、鞋子或产品道具；或把人物缩小到微型尺度，例如比电脑键盘按键还小的人物在日常空间里搞怪互动。通过尺度反差、真实环境参照物和轻喜剧动作制造第一眼冲击，同时保持与原广告产品、场景和色调的连贯性。',
  },
  {
    value: 'street_conflict',
    label: '街头冲突前贴',
    promptTemplate:
      '街头冲突前贴：把产品卖点或用户痛点放进街头偶发冲突、对峙、围观或高压场景中，用紧凑对白、手持感镜头和快速反应制造开场张力。',
  },
  {
    value: 'bizarre_scene',
    label: '离奇画面前贴',
    promptTemplate:
      '离奇画面前贴：一般用于短剧广告，基于原广告的人物关系、情绪和场景生成离奇但可理解的画面，用异常事件或荒诞处境引出正片冲突。',
  },
  {
    value: 'emotional_resonance',
    label: '情绪共鸣前贴',
    promptTemplate:
      '情绪共鸣前贴：用孤独、焦虑、惊喜、遗憾、松弛或被理解等情绪切入，把产品或剧情与用户真实处境连接起来，开场要有明确情绪触发点。',
  },
  {
    value: 'emotional_amplification',
    label: '情绪放大',
    promptTemplate:
      '情绪放大：先理解原广告所属品类和主导情绪，再在合规尺度下把欲望、恐惧、紧张、羞耻、兴奋、压迫感或爽感等核心情绪视觉化并推到更强。社交类广告可用成人暧昧氛围、昏暗灯光、透明屏风后的女性轮廓、近距离呼吸感和克制遮挡来表现吸引力，禁止裸露、性行为、未成年人或色情化表达；微恐/惊悚短剧可用五官错位、影子异变、皮肤下不明轮廓、触手状幻觉、空间扭曲和突然贴近镜头放大恐惧，避免血腥爆裂、器官外露、蛆虫等直接 gore 画面。整体必须服务原广告卖点或剧情钩子，并保持平台可投放的审美尺度。',
  },
] as const;

export type PretrailerStyle = (typeof PRETRAILER_VIDEO_TYPE_DEFINITIONS)[number]['value'];

export const DEFAULT_PRETRAILER_VIDEO_TYPE: PretrailerStyle = 'benefit';

const LEGACY_PRETRAILER_STYLE_MAP: Record<string, PretrailerStyle> = {
  auto: 'benefit',
  suspense: 'street_conflict',
  contrast: 'surreal',
  pain: 'benefit',
};

export function isPretrailerStyle(value: unknown): value is PretrailerStyle {
  return (
    typeof value === 'string' &&
    PRETRAILER_VIDEO_TYPE_DEFINITIONS.some((definition) => definition.value === value)
  );
}

export function normalizePretrailerStyle(value: unknown): PretrailerStyle {
  if (isPretrailerStyle(value)) {
    return value;
  }
  if (typeof value === 'string' && LEGACY_PRETRAILER_STYLE_MAP[value] !== undefined) {
    return LEGACY_PRETRAILER_STYLE_MAP[value];
  }
  return DEFAULT_PRETRAILER_VIDEO_TYPE;
}

export function getPretrailerVideoTypePrompt(value: unknown): string {
  const style = normalizePretrailerStyle(value);
  return (
    PRETRAILER_VIDEO_TYPE_DEFINITIONS.find((definition) => definition.value === style)
      ?.promptTemplate ?? PRETRAILER_VIDEO_TYPE_DEFINITIONS[0].promptTemplate
  );
}

export interface PretrailerInput {
  sourceVideoPath: string;
  pretrailerDuration: number;
  style: PretrailerStyle;
  resolution?: VideoResolution;
}

export interface AvatarInput {
  avatarImagePath: string;
  brandIntro: string;
  productImagePaths: string[];
  duration: number;
  resolution?: VideoResolution;
}

export interface NativeInput {
  industry: NativeIndustry;
  brief: string;
  productName?: string;
  referenceVideoPath?: string;
  variantCount: number;
  durationSec: number;
  ratio: NativeRatio;
  resolution?: VideoResolution;
}

export interface CopywritingInput {
  industry: CopywritingIndustry;
  requirement: string;
  productName?: string;
  audience?: string;
  platform?: string;
  format: CopywritingScriptFormat;
  variantCount: number;
  durationSec: number;
  enableWebSearch?: boolean;
}

export interface LarkDownloadInput {
  url: string;
  outputDir?: string;
}

export interface LarkDownloadSuccessItem {
  fileToken: string;
  mountNodeToken: string;
  name: string;
  path: string;
  size: number;
  mimeType?: string;
  fileType?: string;
  quality: string;
  skipped: boolean;
}

export interface LarkDownloadFailureItem {
  fileToken: string;
  mountNodeToken: string;
  name: string;
  reason: string;
}

export interface LarkDownloadSummary {
  sourceUrl: string;
  sourceType: LarkDocumentType;
  sourceToken: string;
  outputDir: string;
  discovered: number;
  successCount: number;
  failureCount: number;
  loginRequired: boolean;
  loginHint?: string;
  successes: LarkDownloadSuccessItem[];
  failures: LarkDownloadFailureItem[];
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
  ttsApiKey?: string;
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
  ttsApiKey?: string;
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
  artifactPath?: string;
}

export interface CreateTaskRequest {
  type: TaskType;
  input:
    | ExplosionInput
    | PretrailerInput
    | AvatarInput
    | NativeInput
    | CopywritingInput
    | LarkDownloadInput;
}

export interface RetryStepRequest {
  taskId: string;
  stepId: string;
}

export interface ConfirmScriptRequest {
  taskId: string;
}

export interface OpenPathRequest {
  path: string;
}

export interface ReadTextRequest {
  path: string;
  maxBytes?: number;
}

export interface ReadTextResult {
  path: string;
  content: string;
  truncated: boolean;
}

export interface PickFileRequest {
  filters: Array<{ name: string; extensions: string[] }>;
  multi?: boolean;
}
