import { existsSync } from 'node:fs';
import { copyFile } from 'node:fs/promises';

import pLimit from 'p-limit';

import { AppError, toAppError } from '../../errors.js';
import { concatSilentVideos, concatVideos, muxAudioVideo, trimVideo } from '../../media/ffmpeg.js';
import type { SeedanceVideoRequest } from '../../model-client/index.js';
import { DEFAULT_VIDEO_RESOLUTION, type NativeIndustry, type NativeInput } from '../../../shared/types.js';
import type { TaskStep } from '../../../shared/types.js';
import { NATIVE_INDUSTRY_DEFINITIONS } from '../../../shared/workflows.js';
import { errorTypeLabel } from '../task-log.js';
import {
  artifactPath,
  buildReferencePolicyText,
  buildSeedancePromptCard,
  parseModelJson,
  readJson,
  SEEDANCE_MIN_GENERATION_DURATION_SEC,
  splitDurationForSeedanceGeneration,
  waitForScriptConfirmation,
  workflowPrompt,
  writeJson,
  writeText,
} from '../helpers.js';
import type { PipelineDefinition, StepContext } from '../types.js';

interface IndustryRoute {
  industry: NativeIndustry;
  title: string;
  formula: string;
  durationRange: string;
  requiredModules: string[];
  complianceFocus: string;
  hardRules: {
    blacklistWords: string[];
    forbiddenScenes: string[];
    outputNamePattern?: string;
  };
}

interface ConceptPlan {
  concepts: Array<{
    index: number;
    title: string;
    hook: string;
    firstSecondHook?: string;
    audience: string;
    sellingPoints: string[];
    proofPoint?: string;
    modules: string[];
    cta: string;
    tone: string;
    materialFormula?: string;
    noveltyAngle?: string;
    commodityAssetFit?: string;
    riskControl?: string;
  }>;
}

interface ScriptBundle {
  scripts: Array<{
    index: number;
    title: string;
    script: string;
    voiceover?: string;
    cta: string;
    hookType?: string;
    riskControl?: string;
    beats: Array<{ timeSec: number; text: string }>;
  }>;
}

interface StoryboardShot {
  index: number;
  durationSec: number;
  shotType?: 'ai_pretrailer' | 'digital_human' | 'product_demo' | 'atmosphere' | 'cta';
  imagePrompt: string;
  videoPrompt: string;
  visualAnchor?: string;
  behaviorState?: string;
  localTone?: string;
  videoTheme?: string;
  referencePolicy?: string;
  voiceoverText?: string;
  module?: string;
}

interface StoryboardVariant {
  index: number;
  title: string;
  script: string;
  voiceover?: string;
  shots: StoryboardShot[];
}

interface StoryboardBundle {
  variants: StoryboardVariant[];
}

type NativeAssetStatus = 'success' | 'failed';
type NativeAssetPhase = 'generating_segments' | 'composing' | 'completed' | 'failed';

interface NativeAsset {
  index: number;
  title: string;
  status?: NativeAssetStatus;
  phase?: NativeAssetPhase;
  videoPath: string;
  audioPath?: string;
  error?: string;
  durationSec?: number;
  segments?: NativeAssetSegment[];
  usedReferenceVideo?: boolean;
  usedReferenceImages?: boolean;
  usedReferenceAudio?: boolean;
  referenceImagePaths?: string[];
  referenceAudioPath?: string;
  completedAt?: number;
  failedAt?: number;
}

interface NativeAssetSegment {
  index: number;
  status?: 'success' | 'failed';
  path: string;
  durationSec: number;
  error?: string;
  usedReferenceVideo?: boolean;
  usedReferenceImages?: boolean;
  usedReferenceAudio?: boolean;
  referenceVideoPath?: string;
  referenceImagePaths?: string[];
  referenceAudioPath?: string;
  completedAt?: number;
  failedAt?: number;
}

interface NativeVideoPromptSegment {
  index: number;
  durationSec: number;
  prompt: string;
  noReferencePrompt: string;
}

interface NativeVideoPromptVariant {
  index: number;
  segments: NativeVideoPromptSegment[];
}

interface NativeVideoPrompts {
  variants: NativeVideoPromptVariant[];
}

interface NativeAssets {
  assets: NativeAsset[];
  summary?: {
    total: number;
    success: number;
    failed: number;
    skipped: number;
    updatedAt: number;
  };
}

interface ConsistencyItem {
  index: number;
  pass: boolean;
  issues: string[];
  score: number;
  scores?: {
    hook?: number;
    clarity?: number;
    story?: number;
    visualQuality?: number;
    referenceConsistency?: number;
    originality?: number;
    compliance?: number;
  };
  repairPrompt?: string;
  regeneratePolicy?: string;
  referenceMismatch?: string[];
}

interface ConsistencyReport {
  checks: ConsistencyItem[];
  summary: {
    total: number;
    passed: number;
    warned: number;
    blocking: false;
  };
}

interface StoryboardSegment {
  index: number;
  shots: StoryboardShot[];
  durationSec: number;
}

const SEEDANCE_MIN_DURATION_SEC = SEEDANCE_MIN_GENERATION_DURATION_SEC;
function createRoute(input: NativeInput): IndustryRoute {
  const definition = NATIVE_INDUSTRY_DEFINITIONS[input.industry];
  const hardRules: IndustryRoute['hardRules'] = {
    blacklistWords: [],
    forbiddenScenes: [],
  };
  if (input.industry === 'social') {
    hardRules.blacklistWords = ['免费', '加微信', '3S', '直奔主题'];
    hardRules.forbiddenScenes = ['床', '浴室', '酒店走廊', '玉米地'];
  }
  if (input.industry === 'game') {
    hardRules.blacklistWords = ['外挂', '代练', '100%中奖'];
  }
  if (input.industry === 'money_making') {
    hardRules.blacklistWords = ['稳赚', '日入', '秒到账', '保证提现', '躺赚'];
    hardRules.forbiddenScenes = ['虚假到账截图', '诱导点击下载'];
  }
  if (input.industry === 'novel') {
    hardRules.outputNamePattern = '^AIGC_novel_.+\\.mp4$';
  }
  return {
    industry: definition.id,
    title: definition.title,
    formula: definition.formula,
    durationRange: definition.durationRange,
    requiredModules: definition.requiredModules,
    complianceFocus: definition.complianceFocus,
    hardRules,
  };
}

function variantText(variant: StoryboardVariant): string {
  return [
    variant.title,
    variant.script,
    variant.voiceover ?? '',
    ...variant.shots.flatMap((shot) => [
      shot.imagePrompt,
      shot.videoPrompt,
      shot.voiceoverText ?? '',
      shot.module ?? '',
    ]),
  ].join('\n');
}

function findComplianceViolations(route: IndustryRoute, storyboard: StoryboardBundle): string[] {
  const text = storyboard.variants.map(variantText).join('\n');
  const wordHits = route.hardRules.blacklistWords.filter((word) => text.includes(word));
  const sceneHits = route.hardRules.forbiddenScenes.filter((scene) => text.includes(scene));
  return [
    ...wordHits.map((word) => `违禁词：${word}`),
    ...sceneHits.map((scene) => `禁用场景：${scene}`),
  ];
}

function ensureConcepts(plan: ConceptPlan): ConceptPlan {
  if (!Array.isArray(plan.concepts) || plan.concepts.length === 0) {
    throw new AppError('E_MODEL_API_FAILED', '行业概念规划为空');
  }
  if (
    plan.concepts.some(
      (concept) => !concept.title || !concept.hook || !Array.isArray(concept.sellingPoints),
    )
  ) {
    throw new AppError('E_MODEL_API_FAILED', '行业概念规划缺少必要字段');
  }
  return plan;
}

function ensureScripts(bundle: ScriptBundle): ScriptBundle {
  if (!Array.isArray(bundle.scripts) || bundle.scripts.length === 0) {
    throw new AppError('E_MODEL_API_FAILED', '行业脚本为空');
  }
  if (
    bundle.scripts.some((script) => !script.title || !script.script || !Array.isArray(script.beats))
  ) {
    throw new AppError('E_MODEL_API_FAILED', '行业脚本缺少必要字段');
  }
  return bundle;
}

function ensureStoryboard(bundle: StoryboardBundle): StoryboardBundle {
  if (!Array.isArray(bundle.variants) || bundle.variants.length === 0) {
    throw new AppError('E_MODEL_API_FAILED', '行业分镜为空');
  }
  const invalid = bundle.variants.some(
    (variant) =>
      !variant.title ||
      !variant.script ||
      !Array.isArray(variant.shots) ||
      variant.shots.length === 0 ||
      variant.shots.some((shot) => !shot.videoPrompt || !shot.imagePrompt),
  );
  if (invalid) {
    throw new AppError('E_MODEL_API_FAILED', '行业分镜缺少必要字段');
  }
  return bundle;
}

function storyboardSourceText(shots: StoryboardShot[]): string {
  return shots
    .map(
      (shot) =>
        `镜头 ${shot.index}（${shot.durationSec}s）：${shot.videoPrompt}。场景图：${shot.imagePrompt}。口播参考（仅用于节奏，不生成画面文字）：${shot.voiceoverText ?? ''}。模块：${shot.module ?? ''}。片段类型：${shot.shotType ?? ''}`,
    )
    .join('\n');
}

function storyboardPromptText(variant: StoryboardVariant, referencePolicy: string): string {
  return buildSeedancePromptCard({
    outputGoal: '六行业原生爆款广告素材生成',
    visualAnchor: variant.shots.map((shot) => shot.visualAnchor ?? shot.videoPrompt).join('；'),
    behaviorState: variant.shots.map((shot) => shot.behaviorState ?? shot.videoPrompt).join('；'),
    localTone: variant.shots.map((shot) => shot.localTone ?? '信息流广告节奏，首秒清晰').join('；'),
    videoTheme: variant.shots.map((shot) => shot.videoTheme ?? shot.module ?? '行业广告模块').join('；'),
    referencePolicy,
    sourceText: storyboardSourceText(variant.shots),
    preservedConstraints: ['行业公式', '首秒钩子', '商品或剧情识别度', '合规重点', '不生成画面文字'],
  });
}

function storyboardSegmentPromptText(
  segment: StoryboardSegment,
  segmentCount: number,
  referencePolicy: string,
): string {
  const segmentNote =
    segmentCount > 1
      ? `当前只生成第 ${segment.index}/${segmentCount} 段，片段时长 ${segment.durationSec}s。请与前后片段保持主体、动作节奏、光线、色彩和情绪连续。`
      : undefined;
  return buildSeedancePromptCard({
    outputGoal: '六行业原生爆款广告素材分段生成',
    durationSec: segment.durationSec,
    visualAnchor: segment.shots.map((shot) => shot.visualAnchor ?? shot.videoPrompt).join('；'),
    behaviorState: segment.shots.map((shot) => shot.behaviorState ?? shot.videoPrompt).join('；'),
    localTone: segment.shots.map((shot) => shot.localTone ?? '信息流广告节奏，首秒清晰').join('；'),
    videoTheme: segment.shots.map((shot) => shot.videoTheme ?? shot.module ?? '行业广告模块').join('；'),
    referencePolicy,
    sourceText: storyboardSourceText(segment.shots),
    preservedConstraints: ['行业公式', '首秒钩子', '商品或剧情识别度', '合规重点', '不生成画面文字'],
    segmentNote,
  });
}

function safeName(value: string): string {
  return value
    .trim()
    .replace(/[^\p{L}\p{N}_-]+/gu, '_')
    .replace(/^_+|_+$/gu, '')
    .slice(0, 48);
}

function finalFileName(route: IndustryRoute, asset: NativeAsset): string {
  if (route.industry === 'novel') {
    return `AIGC_novel_${safeName(asset.title) || 'variant'}_${asset.index}.mp4`;
  }
  return `final_${asset.index}.mp4`;
}

function seedanceReferenceFilter(ratio: NativeInput['ratio']): string {
  if (ratio === '16:9') {
    return 'scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720';
  }
  if (ratio === '1:1') {
    return 'scale=720:720:force_original_aspect_ratio=increase,crop=720:720';
  }
  return 'scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280';
}

function isReferenceVideoRejected(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /InputVideoSensitiveContentDetected|real person|reference_video|video duration|duration/iu.test(
    message,
  );
}

function splitDurationForSeedance(durationSec: number): number[] {
  return splitDurationForSeedanceGeneration(durationSec);
}

function normalizeVariantShotsForTarget(
  variant: StoryboardVariant,
  targetDurationSec: number,
): StoryboardShot[] {
  const target = Math.max(SEEDANCE_MIN_DURATION_SEC, Math.round(targetDurationSec));
  const fallbackDuration = target / Math.max(variant.shots.length, 1);
  const rawDurations = variant.shots.map((shot) =>
    Number.isFinite(shot.durationSec) && shot.durationSec > 0 ? shot.durationSec : fallbackDuration,
  );
  const rawTotal = rawDurations.reduce((total, duration) => total + duration, 0) || target;
  const durations = rawDurations.map((duration) =>
    Math.max(1, Math.round((duration / rawTotal) * target)),
  );
  let diff = target - durations.reduce((total, duration) => total + duration, 0);
  let cursor = 0;
  while (diff !== 0 && durations.length > 0) {
    const index = cursor % durations.length;
    const current = durations[index] ?? 1;
    if (diff > 0) {
      durations[index] = current + 1;
      diff -= 1;
    } else if (current > 1) {
      durations[index] = current - 1;
      diff += 1;
    }
    cursor += 1;
    if (cursor > durations.length * target * 2) {
      break;
    }
  }
  return variant.shots.map((shot, index) => ({
    ...shot,
    durationSec: durations[index] ?? fallbackDuration,
  }));
}

function splitVariantForSeedance(
  variant: StoryboardVariant,
  targetDurationSec: number,
): StoryboardSegment[] {
  const segmentDurations = splitDurationForSeedance(targetDurationSec);
  const shots = normalizeVariantShotsForTarget(variant, targetDurationSec);
  const segments: StoryboardSegment[] = [];
  let shotIndex = 0;
  let remainingShotDuration = shots[0]?.durationSec ?? 0;
  const partCounters = new Map<number, number>();

  for (const segmentDuration of segmentDurations) {
    const segmentShots: StoryboardShot[] = [];
    let remainingSegmentDuration = segmentDuration;
    while (remainingSegmentDuration > 0 && shotIndex < shots.length) {
      const shot = shots[shotIndex];
      if (shot === undefined) {
        break;
      }
      const takeDuration = Math.min(remainingShotDuration, remainingSegmentDuration);
      const part = (partCounters.get(shot.index) ?? 0) + 1;
      partCounters.set(shot.index, part);
      segmentShots.push({
        ...shot,
        index: part === 1 ? shot.index : Number(`${shot.index}.${part}`),
        durationSec: takeDuration,
        videoPrompt:
          part === 1
            ? shot.videoPrompt
            : `${shot.videoPrompt}（延续镜头 ${shot.index} 的第 ${part} 段，保持动作和构图连续。）`,
      });
      remainingShotDuration -= takeDuration;
      remainingSegmentDuration -= takeDuration;
      if (remainingShotDuration <= 0) {
        shotIndex += 1;
        remainingShotDuration = shots[shotIndex]?.durationSec ?? 0;
      }
    }
    segments.push({
      index: segments.length + 1,
      shots: segmentShots.length > 0 ? segmentShots : shots.slice(0, 1),
      durationSec: segmentDuration,
    });
  }
  return segments;
}

function buildNativeAssetsReport(
  assets: NativeAsset[],
  total: number,
  skipped: number,
): NativeAssets {
  const success = assets.filter((asset) => asset.status === 'success').length;
  const failed = assets.filter((asset) => asset.status === 'failed').length;
  return {
    assets,
    summary: {
      total,
      success,
      failed,
      skipped,
      updatedAt: Date.now(),
    },
  };
}

function isReusableNativeAsset(asset: NativeAsset | undefined): boolean {
  return (
    asset?.status === 'success' &&
    typeof asset.videoPath === 'string' &&
    existsSync(asset.videoPath) &&
    (asset.audioPath === undefined || existsSync(asset.audioPath))
  );
}

function isReusableNativeSegment(
  segment: NativeAssetSegment | undefined,
): segment is NativeAssetSegment {
  return (
    segment?.status === 'success' && typeof segment.path === 'string' && existsSync(segment.path)
  );
}

async function readNativeAssetsIfExists(path: string): Promise<NativeAssets | undefined> {
  if (!existsSync(path)) {
    return undefined;
  }
  return readJson<NativeAssets>(path);
}

async function canResumeAssetGenerator(
  ctx: StepContext<NativeInput>,
  step: TaskStep,
): Promise<boolean> {
  const assetsPath = step.artifactPath ?? artifactPath(ctx.artifactDir, 'assets.json');
  const previousAssets = await readNativeAssetsIfExists(assetsPath);
  if (previousAssets === undefined) {
    return false;
  }
  const expectedTotal = previousAssets.summary?.total ?? ctx.input.variantCount;
  return (
    expectedTotal > 0 &&
    previousAssets.assets.length >= expectedTotal &&
    previousAssets.assets.every((asset) => isReusableNativeAsset(asset))
  );
}

async function runIndustryRouter(ctx: StepContext<NativeInput>) {
  const route = createRoute(ctx.input);
  return { artifactPath: await writeJson(artifactPath(ctx.artifactDir, 'industry.json'), route) };
}

async function runConceptPlanner(ctx: StepContext<NativeInput>) {
  const route = await readJson<IndustryRoute>(artifactPath(ctx.artifactDir, 'industry.json'));
  const response = await ctx.modelClient.chat([
    { role: 'system', content: '你是多行业短视频广告策略规划师，只输出合法 JSON。' },
    {
      role: 'user',
      content: workflowPrompt(ctx, 'native.concept_plan', {
        industryTitle: route.title,
        formula: route.formula,
        durationRange: route.durationRange,
        requiredModules: route.requiredModules.join('、'),
        complianceFocus: route.complianceFocus,
        brief: ctx.input.brief,
        productName: ctx.input.productName ?? '未命名产品',
        variantCount: ctx.input.variantCount,
        durationSec: ctx.input.durationSec,
        ratio: ctx.input.ratio,
      }),
    },
  ]);
  const plan = ensureConcepts(parseModelJson<ConceptPlan>(response, '行业概念规划'));
  return { artifactPath: await writeJson(artifactPath(ctx.artifactDir, 'concepts.json'), plan) };
}

async function runScriptWriter(ctx: StepContext<NativeInput>) {
  const route = await readJson<IndustryRoute>(artifactPath(ctx.artifactDir, 'industry.json'));
  const concepts = await readJson<ConceptPlan>(artifactPath(ctx.artifactDir, 'concepts.json'));
  const response = await ctx.modelClient.chat([
    { role: 'system', content: '你是信息流广告脚本编导，只输出合法 JSON。' },
    {
      role: 'user',
      content: workflowPrompt(ctx, 'native.script_writer', {
        industryTitle: route.title,
        brief: ctx.input.brief,
        conceptsJson: JSON.stringify(concepts),
        durationSec: ctx.input.durationSec,
      }),
    },
  ]);
  const scripts = ensureScripts(parseModelJson<ScriptBundle>(response, '行业脚本生成'));
  await writeText(
    artifactPath(ctx.artifactDir, 'scripts.md'),
    scripts.scripts.map((script) => `## ${script.title}\n\n${script.script}`).join('\n\n'),
  );
  return { artifactPath: await writeJson(artifactPath(ctx.artifactDir, 'scripts.json'), scripts) };
}

async function runScriptConfirm(ctx: StepContext<NativeInput>) {
  return waitForScriptConfirmation(ctx, 'scripts.md', '原生素材脚本文案');
}

async function runStoryboardBuilder(ctx: StepContext<NativeInput>) {
  const route = await readJson<IndustryRoute>(artifactPath(ctx.artifactDir, 'industry.json'));
  const scripts = await readJson<ScriptBundle>(artifactPath(ctx.artifactDir, 'scripts.json'));
  const response = await ctx.modelClient.chat([
    { role: 'system', content: '你是短视频广告分镜师，只输出合法 JSON。' },
    {
      role: 'user',
      content: workflowPrompt(ctx, 'native.storyboard_builder', {
        industryTitle: route.title,
        ratio: ctx.input.ratio,
        scriptsJson: JSON.stringify(scripts),
        durationSec: ctx.input.durationSec,
      }),
    },
  ]);
  const storyboard = ensureStoryboard(parseModelJson<StoryboardBundle>(response, '行业分镜构建'));
  return {
    artifactPath: await writeJson(artifactPath(ctx.artifactDir, 'storyboard.json'), storyboard),
  };
}

async function runCompliancePre(ctx: StepContext<NativeInput>) {
  const route = await readJson<IndustryRoute>(artifactPath(ctx.artifactDir, 'industry.json'));
  let storyboard = await readJson<StoryboardBundle>(
    artifactPath(ctx.artifactDir, 'storyboard.json'),
  );
  let violations = findComplianceViolations(route, storyboard);
  let rewriteCount = 0;

  while (violations.length > 0 && rewriteCount < 2) {
    const response = await ctx.modelClient.chat([
      { role: 'system', content: '你是广告合规改写助手，只输出合法 JSON。' },
      {
        role: 'user',
        content: workflowPrompt(ctx, 'native.compliance_rewrite', {
          industryTitle: route.title,
          violations: violations.join('；'),
          storyboardJson: JSON.stringify(storyboard),
        }),
      },
    ]);
    storyboard = ensureStoryboard(parseModelJson<StoryboardBundle>(response, '行业合规改写'));
    await writeJson(artifactPath(ctx.artifactDir, 'storyboard.json'), storyboard);
    violations = findComplianceViolations(route, storyboard);
    rewriteCount += 1;
  }

  if (violations.length > 0) {
    throw new AppError('E_INPUT_VALIDATION', `行业合规校验未通过：${violations.join('；')}`);
  }

  return {
    artifactPath: await writeJson(artifactPath(ctx.artifactDir, 'compliance_pre.json'), {
      pass: true,
      rewriteCount,
      violations: [],
    }),
  };
}

async function runVideoPromptOptimize(ctx: StepContext<NativeInput>) {
  const route = await readJson<IndustryRoute>(artifactPath(ctx.artifactDir, 'industry.json'));
  const storyboard = await readJson<StoryboardBundle>(
    artifactPath(ctx.artifactDir, 'storyboard.json'),
  );
  const targetDurationSec = Math.max(SEEDANCE_MIN_DURATION_SEC, Math.round(ctx.input.durationSec));
  const hasReferenceImages = (ctx.input.referenceImagePaths?.length ?? 0) > 0;
  const hasReferenceAudio = ctx.input.referenceAudioPath !== undefined;
  const promptVariants: NativeVideoPromptVariant[] = storyboard.variants.map((variant) => {
    const segments = splitVariantForSeedance(variant, targetDurationSec);
    return {
      index: variant.index,
      segments: segments.map((segment) => {
        const hasReferenceVideo = ctx.input.referenceVideoPath !== undefined || segment.index > 1;
        const referencePolicy = buildReferencePolicyText({
          hasReferenceVideo,
          hasReferenceImages,
          hasReferenceAudio,
          purpose: `${route.title}行业原生素材「${variant.title}」生成：保持行业公式、首秒钩子和转化目标。`,
        });
        const noReferencePolicy = buildReferencePolicyText({
          hasReferenceImages,
          hasReferenceAudio,
          purpose: `${route.title}行业原生素材「${variant.title}」无参考视频生成：基于脚本和分镜完成画面。`,
          noReferenceFallback: '当前参考视频不可用或被模型拒绝，只基于脚本、分镜和行业公式生成，不要声称参考了视频。',
        });
        return {
          index: segment.index,
          durationSec: segment.durationSec,
          prompt: workflowPrompt(ctx, 'native.asset_generator', {
            industryTitle: route.title,
            title: variant.title,
            script: variant.script,
            storyboard:
              segments.length > 1
                ? storyboardSegmentPromptText(segment, segments.length, referencePolicy)
                : storyboardPromptText(variant, referencePolicy),
            ratio: ctx.input.ratio,
            referencePolicy,
          }),
          noReferencePrompt: workflowPrompt(ctx, 'native.asset_generator', {
            industryTitle: route.title,
            title: variant.title,
            script: variant.script,
            storyboard:
              segments.length > 1
                ? storyboardSegmentPromptText(segment, segments.length, noReferencePolicy)
                : storyboardPromptText(variant, noReferencePolicy),
            ratio: ctx.input.ratio,
            referencePolicy: noReferencePolicy,
          }),
        };
      }),
    };
  });
  return {
    artifactPath: await writeJson(artifactPath(ctx.artifactDir, 'video_prompts.json'), {
      variants: promptVariants,
    }),
  };
}

interface NativeAssetReferences {
  referenceImagePaths?: string[];
  referenceAudioPath?: string;
}

interface NativeAssetGenerationState {
  route: IndustryRoute;
  storyboard: StoryboardBundle;
  videoPrompts?: NativeVideoPrompts;
  assetsPath: string;
  targetDurationSec: number;
  references: NativeAssetReferences;
}

interface NativeVariantPlan {
  variant: StoryboardVariant;
  videoPath: string;
  generatedVideoPath: string;
  voiceover: string;
  shouldMuxVoiceover: boolean;
  segments: StoryboardSegment[];
}

type GeneratedSegmentResult =
  | { ok: true; segment: NativeAssetSegment }
  | { ok: false; segment: NativeAssetSegment };

class NativeAssetStateStore {
  private readonly results: Map<number, NativeAsset>;
  private skippedCount = 0;
  private persistQueue = Promise.resolve();

  constructor(
    private readonly storyboard: StoryboardBundle,
    private readonly assetsPath: string,
    previousAssets: NativeAssets | undefined,
  ) {
    this.results = new Map(previousAssets?.assets.map((asset) => [asset.index, asset]) ?? []);
  }

  get skipped(): number {
    return this.skippedCount;
  }

  getExisting(index: number): NativeAsset | undefined {
    return this.results.get(index);
  }

  isReusable(index: number): boolean {
    return isReusableNativeAsset(this.getExisting(index));
  }

  async markSkipped(): Promise<void> {
    this.skippedCount += 1;
    await this.persist();
  }

  async record(asset: NativeAsset): Promise<void> {
    this.results.set(asset.index, asset);
    await this.persist();
  }

  getAssets(): NativeAsset[] {
    return this.storyboard.variants
      .map((variant) => this.results.get(variant.index))
      .filter((asset): asset is NativeAsset => asset !== undefined);
  }

  async finalize(): Promise<string> {
    await this.persistQueue;
    return writeJson(
      this.assetsPath,
      buildNativeAssetsReport(this.getAssets(), this.storyboard.variants.length, this.skipped),
    );
  }

  private persist(): Promise<void> {
    this.persistQueue = this.persistQueue.then(async () => {
      await writeJson(
        this.assetsPath,
        buildNativeAssetsReport(this.getAssets(), this.storyboard.variants.length, this.skipped),
      );
    });
    return this.persistQueue;
  }
}

function sumNativeSegmentDurations(segments: NativeAssetSegment[]): number {
  return segments.reduce((total, item) => total + item.durationSec, 0);
}

function buildVariantPlan(
  ctx: StepContext<NativeInput>,
  variant: StoryboardVariant,
  targetDurationSec: number,
): NativeVariantPlan {
  const videoPath = artifactPath(ctx.artifactDir, `asset_variant_${variant.index}.mp4`);
  const voiceover =
    variant.voiceover ??
    variant.shots
      .map((shot) => shot.voiceoverText)
      .filter(Boolean)
      .join(' ');
  const shouldMuxVoiceover = voiceover.length > 0;
  const generatedVideoPath = shouldMuxVoiceover
    ? artifactPath(ctx.artifactDir, `asset_variant_${variant.index}_silent.mp4`)
    : videoPath;

  return {
    variant,
    videoPath,
    generatedVideoPath,
    voiceover,
    shouldMuxVoiceover,
    segments: splitVariantForSeedance(variant, targetDurationSec),
  };
}

function buildNativeAssetSnapshot(params: {
  plan: NativeVariantPlan;
  status?: NativeAssetStatus;
  phase?: NativeAssetPhase;
  videoPath: string;
  segments: NativeAssetSegment[];
  references: NativeAssetReferences;
  error?: string;
  audioPath?: string;
  completedAt?: number;
  failedAt?: number;
}): NativeAsset {
  const phase =
    params.phase ??
    (params.status === 'success' ? 'completed' : params.status === 'failed' ? 'failed' : undefined);
  return {
    index: params.plan.variant.index,
    title: params.plan.variant.title,
    ...(params.status !== undefined ? { status: params.status } : {}),
    ...(phase !== undefined ? { phase } : {}),
    videoPath: params.videoPath,
    ...(params.audioPath !== undefined ? { audioPath: params.audioPath } : {}),
    ...(params.error !== undefined ? { error: params.error } : {}),
    durationSec: sumNativeSegmentDurations(params.segments),
    segments: params.segments,
    usedReferenceVideo: params.segments.some((item) => item.usedReferenceVideo),
    usedReferenceImages: params.segments.some((item) => item.usedReferenceImages),
    usedReferenceAudio: params.segments.some((item) => item.usedReferenceAudio),
    ...(params.references.referenceImagePaths !== undefined
      ? { referenceImagePaths: params.references.referenceImagePaths }
      : {}),
    ...(params.references.referenceAudioPath !== undefined
      ? { referenceAudioPath: params.references.referenceAudioPath }
      : {}),
    ...(params.completedAt !== undefined ? { completedAt: params.completedAt } : {}),
    ...(params.failedAt !== undefined ? { failedAt: params.failedAt } : {}),
  };
}

function buildNativeSegmentSnapshot(params: {
  segment: StoryboardSegment;
  status: 'success' | 'failed';
  path: string;
  usedReferenceVideo: boolean;
  references: NativeAssetReferences;
  referenceVideoPath?: string;
  error?: string;
}): NativeAssetSegment {
  return {
    index: params.segment.index,
    status: params.status,
    path: params.path,
    durationSec: params.segment.durationSec,
    ...(params.error !== undefined ? { error: params.error } : {}),
    usedReferenceVideo: params.usedReferenceVideo,
    usedReferenceImages: params.references.referenceImagePaths !== undefined,
    usedReferenceAudio: params.references.referenceAudioPath !== undefined,
    ...(params.referenceVideoPath !== undefined
      ? { referenceVideoPath: params.referenceVideoPath }
      : {}),
    ...(params.references.referenceImagePaths !== undefined
      ? { referenceImagePaths: params.references.referenceImagePaths }
      : {}),
    ...(params.references.referenceAudioPath !== undefined
      ? { referenceAudioPath: params.references.referenceAudioPath }
      : {}),
    ...(params.status === 'success' ? { completedAt: Date.now() } : { failedAt: Date.now() }),
  };
}

function findOptimizedNativeVideoPrompt(
  videoPrompts: NativeVideoPrompts | undefined,
  variantIndex: number,
  segmentIndex: number,
): NativeVideoPromptSegment | undefined {
  return videoPrompts?.variants
    .find((item) => item.index === variantIndex)
    ?.segments.find((item) => item.index === segmentIndex);
}

async function createNativeAssetGenerationState(
  ctx: StepContext<NativeInput>,
): Promise<NativeAssetGenerationState> {
  const route = await readJson<IndustryRoute>(artifactPath(ctx.artifactDir, 'industry.json'));
  const storyboard = await readJson<StoryboardBundle>(
    artifactPath(ctx.artifactDir, 'storyboard.json'),
  );
  const videoPromptsPath = artifactPath(ctx.artifactDir, 'video_prompts.json');
  const videoPrompts = existsSync(videoPromptsPath)
    ? await readJson<NativeVideoPrompts>(videoPromptsPath)
    : undefined;
  const referenceImagePaths =
    ctx.input.referenceImagePaths !== undefined && ctx.input.referenceImagePaths.length > 0
      ? ctx.input.referenceImagePaths
      : undefined;

  return {
    route,
    storyboard,
    ...(videoPrompts !== undefined ? { videoPrompts } : {}),
    assetsPath: artifactPath(ctx.artifactDir, 'assets.json'),
    targetDurationSec: Math.max(SEEDANCE_MIN_DURATION_SEC, Math.round(ctx.input.durationSec)),
    references: {
      ...(referenceImagePaths !== undefined ? { referenceImagePaths } : {}),
      ...(ctx.input.referenceAudioPath !== undefined
        ? { referenceAudioPath: ctx.input.referenceAudioPath }
        : {}),
    },
  };
}

function createNativeSegmentRequest(params: {
  ctx: StepContext<NativeInput>;
  state: NativeAssetGenerationState;
  plan: NativeVariantPlan;
  segment: StoryboardSegment;
  segmentPath: string;
  referenceVideoPath?: string;
  prompt: string;
}): SeedanceVideoRequest {
  return {
    prompt: params.prompt,
    durationSec: params.segment.durationSec,
    resolution: params.ctx.input.resolution ?? DEFAULT_VIDEO_RESOLUTION,
    ratio: params.ctx.input.ratio,
    generateAudio: true,
    outputPath: params.segmentPath,
    ...(params.referenceVideoPath !== undefined
      ? { refVideoPath: params.referenceVideoPath }
      : {}),
    ...(params.state.references.referenceImagePaths !== undefined
      ? { refImagePaths: params.state.references.referenceImagePaths }
      : {}),
    ...(params.state.references.referenceAudioPath !== undefined
      ? { audioPath: params.state.references.referenceAudioPath }
      : {}),
  };
}

async function generateNativeSegment(params: {
  ctx: StepContext<NativeInput>;
  state: NativeAssetGenerationState;
  plan: NativeVariantPlan;
  segment: StoryboardSegment;
  segmentPath: string;
  referenceVideoPath?: string;
}): Promise<GeneratedSegmentResult> {
  const { ctx, state, plan, segment, segmentPath, referenceVideoPath } = params;
  const optimizedSegment = findOptimizedNativeVideoPrompt(
    state.videoPrompts,
    plan.variant.index,
    segment.index,
  );
  const referencePolicy = buildReferencePolicyText({
    hasReferenceVideo: referenceVideoPath !== undefined,
    hasReferenceImages: state.references.referenceImagePaths !== undefined,
    hasReferenceAudio: state.references.referenceAudioPath !== undefined,
    purpose: `${state.route.title}行业原生素材「${plan.variant.title}」生成：保持行业公式、首秒钩子和转化目标。`,
  });
  const noReferencePolicy = buildReferencePolicyText({
    hasReferenceImages: state.references.referenceImagePaths !== undefined,
    hasReferenceAudio: state.references.referenceAudioPath !== undefined,
    purpose: `${state.route.title}行业原生素材「${plan.variant.title}」无参考视频生成：基于脚本和分镜完成画面。`,
    noReferenceFallback: '当前参考视频不可用或被模型拒绝，只基于脚本、分镜和行业公式生成，不要声称参考了视频。',
  });
  const prompt =
    optimizedSegment?.prompt ??
    workflowPrompt(ctx, 'native.asset_generator', {
      industryTitle: state.route.title,
      title: plan.variant.title,
      script: plan.variant.script,
      storyboard:
        plan.segments.length > 1
          ? storyboardSegmentPromptText(segment, plan.segments.length, referencePolicy)
          : storyboardPromptText(plan.variant, referencePolicy),
      ratio: ctx.input.ratio,
      referencePolicy,
    });
  const videoRequest = createNativeSegmentRequest({
    ctx,
    state,
    plan,
    segment,
    segmentPath,
    prompt,
    ...(referenceVideoPath !== undefined ? { referenceVideoPath } : {}),
  });
  let usedReferenceVideo = referenceVideoPath !== undefined;

  await ctx.appendLog?.('info', '开始调用 Seedance 生成视频片段', {
    variantIndex: plan.variant.index,
    segmentIndex: segment.index,
    segmentCount: plan.segments.length,
    durationSec: segment.durationSec,
    resolution: videoRequest.resolution,
    generateAudio: videoRequest.generateAudio,
    outputPath: segmentPath,
    hasReferenceVideo: referenceVideoPath !== undefined,
    hasReferenceImages: state.references.referenceImagePaths !== undefined,
    hasReferenceAudio: state.references.referenceAudioPath !== undefined,
    referenceVideoPath,
    referenceImagePaths: state.references.referenceImagePaths,
    referenceAudioPath: state.references.referenceAudioPath,
  });

  try {
    await ctx.modelClient.generateVideo(videoRequest);
  } catch (error) {
    if (referenceVideoPath === undefined || !isReferenceVideoRejected(error)) {
      return {
        ok: false,
        segment: await buildFailedNativeSegment({
          ctx,
          plan,
          segment,
          segmentPath,
          references: state.references,
          error,
          logMessage: 'Seedance 视频片段生成失败',
          ...(referenceVideoPath !== undefined ? { referenceVideoPath } : {}),
        }),
      };
    }

    usedReferenceVideo = false;
    await ctx.appendLog?.('warn', '参考视频被 Seedance 拒绝，改为无参考视频重试', {
      variantIndex: plan.variant.index,
      segmentIndex: segment.index,
      durationSec: segment.durationSec,
      referenceVideoPath,
      error: error instanceof Error ? error.message : String(error),
    });

    try {
      await ctx.modelClient.generateVideo({
        prompt:
          optimizedSegment?.noReferencePrompt ??
          workflowPrompt(ctx, 'native.asset_generator', {
            industryTitle: state.route.title,
            title: plan.variant.title,
            script: plan.variant.script,
            storyboard:
              plan.segments.length > 1
                ? storyboardSegmentPromptText(segment, plan.segments.length, noReferencePolicy)
                : storyboardPromptText(plan.variant, noReferencePolicy),
            ratio: ctx.input.ratio,
            referencePolicy: noReferencePolicy,
          }),
        durationSec: segment.durationSec,
        resolution: ctx.input.resolution ?? DEFAULT_VIDEO_RESOLUTION,
        ratio: ctx.input.ratio,
        generateAudio: true,
        outputPath: videoRequest.outputPath,
        ...(state.references.referenceImagePaths !== undefined
          ? { refImagePaths: state.references.referenceImagePaths }
          : {}),
        ...(state.references.referenceAudioPath !== undefined
          ? { audioPath: state.references.referenceAudioPath }
          : {}),
      });
    } catch (fallbackError) {
      const failedSegment = await buildFailedNativeSegment({
        ctx,
        plan,
        segment,
        segmentPath,
        references: state.references,
        error: fallbackError,
        logMessage: 'Seedance 无参考视频重试失败',
        ...(referenceVideoPath !== undefined ? { referenceVideoPath } : {}),
      });
      return {
        ok: false,
        segment: {
          ...failedSegment,
          error: `参考视频被拒后无参考重试仍失败：${failedSegment.error ?? '未知错误'}`,
          usedReferenceVideo,
        },
      };
    }
  }

  const generatedSegment = buildNativeSegmentSnapshot({
    segment,
    status: 'success',
    path: segmentPath,
    usedReferenceVideo,
    references: state.references,
    ...(referenceVideoPath !== undefined ? { referenceVideoPath } : {}),
  });
  await ctx.appendLog?.('info', 'Seedance 视频片段生成成功', {
    variantIndex: plan.variant.index,
    segmentIndex: segment.index,
    segmentCount: plan.segments.length,
    durationSec: segment.durationSec,
    outputPath: segmentPath,
    usedReferenceVideo,
  });
  return { ok: true, segment: generatedSegment };
}

async function buildFailedNativeSegment(params: {
  ctx: StepContext<NativeInput>;
  plan: NativeVariantPlan;
  segment: StoryboardSegment;
  segmentPath: string;
  references: NativeAssetReferences;
  error: unknown;
  logMessage: string;
  referenceVideoPath?: string;
}): Promise<NativeAssetSegment> {
  const appError = toAppError(params.error, 'E_MODEL_API_FAILED');
  await params.ctx.appendLog?.('error', params.logMessage, {
    variantIndex: params.plan.variant.index,
    title: params.plan.variant.title,
    segmentIndex: params.segment.index,
    segmentCount: params.plan.segments.length,
    durationSec: params.segment.durationSec,
    outputPath: params.segmentPath,
    code: appError.code,
    errorType: errorTypeLabel(appError.code),
    detail: appError.detail ?? appError.message,
    message: appError.message,
  });
  return buildNativeSegmentSnapshot({
    segment: params.segment,
    status: 'failed',
    path: params.segmentPath,
    usedReferenceVideo: params.referenceVideoPath !== undefined,
    references: params.references,
    error: appError.message,
    ...(params.referenceVideoPath !== undefined
      ? { referenceVideoPath: params.referenceVideoPath }
      : {}),
  });
}

async function generateNativeVariantSegments(params: {
  ctx: StepContext<NativeInput>;
  state: NativeAssetGenerationState;
  store: NativeAssetStateStore;
  plan: NativeVariantPlan;
  existing: NativeAsset | undefined;
  initialReferenceVideoPath?: string;
}): Promise<NativeAssetSegment[] | undefined> {
  const { ctx, state, store, plan, existing, initialReferenceVideoPath } = params;
  const previousSegments = new Map<number, NativeAssetSegment>(
    existing?.segments?.map((segment) => [segment.index, segment]) ?? [],
  );
  const generatedSegments: NativeAssetSegment[] = [];
  let nextReferencePath = initialReferenceVideoPath;

  for (const segment of plan.segments) {
    const previousSegment = previousSegments.get(segment.index);
    if (isReusableNativeSegment(previousSegment)) {
      await ctx.appendLog?.('info', '复用已成功的视频片段', {
        variantIndex: plan.variant.index,
        segmentIndex: segment.index,
        durationSec: previousSegment.durationSec,
        path: previousSegment.path,
      });
      generatedSegments.push(previousSegment);
      nextReferencePath = previousSegment.path;
      continue;
    }

    const segmentPath =
      plan.segments.length > 1
        ? artifactPath(ctx.artifactDir, `asset_variant_${plan.variant.index}_part_${segment.index}.mp4`)
        : plan.generatedVideoPath;
    const result = await generateNativeSegment({
      ctx,
      state,
      plan,
      segment,
      segmentPath,
      ...(nextReferencePath !== undefined ? { referenceVideoPath: nextReferencePath } : {}),
    });
    generatedSegments.push(result.segment);

    if (!result.ok) {
      await store.record(
        buildNativeAssetSnapshot({
          plan,
          status: 'failed',
          videoPath: plan.generatedVideoPath,
          error: `第 ${result.segment.index}/${plan.segments.length} 段生成失败：${result.segment.error ?? '未知错误'}`,
          segments: generatedSegments,
          references: state.references,
          failedAt: Date.now(),
        }),
      );
      return undefined;
    }

    nextReferencePath = segmentPath;
    await store.record(
      buildNativeAssetSnapshot({
        plan,
        phase: 'generating_segments',
        videoPath: plan.generatedVideoPath,
        error: `第 ${segment.index}/${plan.segments.length} 段已生成，等待剩余片段`,
        segments: generatedSegments,
        references: state.references,
        failedAt: Date.now(),
      }),
    );
  }

  return generatedSegments;
}

async function composeNativeVariantAsset(params: {
  ctx: StepContext<NativeInput>;
  state: NativeAssetGenerationState;
  plan: NativeVariantPlan;
  generatedSegments: NativeAssetSegment[];
}): Promise<NativeAsset> {
  const { ctx, state, plan, generatedSegments } = params;
  try {
    if (generatedSegments.length > 1 && !existsSync(plan.generatedVideoPath)) {
      await ctx.appendLog?.('info', '开始拼接 Seedance 视频片段', {
        variantIndex: plan.variant.index,
        segmentPaths: generatedSegments.map((segment) => segment.path),
        outputPath: plan.generatedVideoPath,
        audioMode: plan.shouldMuxVoiceover ? 'drop_segment_audio_for_tts' : 'keep_seedance_audio',
      });
      if (plan.shouldMuxVoiceover) {
        await concatSilentVideos(
          generatedSegments.map((segment) => segment.path),
          plan.generatedVideoPath,
        );
      } else {
        await concatVideos(
          generatedSegments.map((segment) => segment.path),
          plan.generatedVideoPath,
        );
      }
      await ctx.appendLog?.('info', 'Seedance 视频片段拼接成功', {
        variantIndex: plan.variant.index,
        outputPath: plan.generatedVideoPath,
      });
    }
  } catch (error) {
    const appError = toAppError(error, 'E_FFMPEG_FAILED');
    await ctx.appendLog?.('error', 'Seedance 视频片段拼接失败', {
      variantIndex: plan.variant.index,
      segmentPaths: generatedSegments.map((segment) => segment.path),
      outputPath: plan.generatedVideoPath,
      code: appError.code,
      errorType: errorTypeLabel(appError.code),
      detail: appError.detail ?? appError.message,
      message: appError.message,
    });
    return buildNativeAssetSnapshot({
      plan,
      status: 'failed',
      videoPath: plan.generatedVideoPath,
      error: `片段拼接失败：${appError.message}`,
      segments: generatedSegments,
      references: state.references,
      failedAt: Date.now(),
    });
  }

  if (!plan.shouldMuxVoiceover) {
    await ctx.appendLog?.('info', '素材无口播文本，使用 Seedance 自带音频输出', {
      variantIndex: plan.variant.index,
      videoPath: plan.videoPath,
    });
    return buildNativeAssetSnapshot({
      plan,
      status: 'success',
      videoPath: plan.videoPath,
      segments: generatedSegments,
      references: state.references,
      completedAt: Date.now(),
    });
  }

  return muxNativeVariantVoiceover({ ctx, state, plan, generatedSegments });
}

async function muxNativeVariantVoiceover(params: {
  ctx: StepContext<NativeInput>;
  state: NativeAssetGenerationState;
  plan: NativeVariantPlan;
  generatedSegments: NativeAssetSegment[];
}): Promise<NativeAsset> {
  const { ctx, state, plan, generatedSegments } = params;
  const reusableSingleSegmentPath =
    generatedSegments.length === 1 ? generatedSegments[0]?.path : undefined;
  if (
    reusableSingleSegmentPath !== undefined &&
    reusableSingleSegmentPath !== plan.generatedVideoPath &&
    existsSync(reusableSingleSegmentPath) &&
    !existsSync(plan.generatedVideoPath)
  ) {
    await ctx.appendLog?.('info', '复制已复用视频片段为口播合成工作文件', {
      variantIndex: plan.variant.index,
      sourcePath: reusableSingleSegmentPath,
      generatedVideoPath: plan.generatedVideoPath,
    });
    await copyFile(reusableSingleSegmentPath, plan.generatedVideoPath);
  }

  try {
    await ctx.appendLog?.('info', '开始生成素材口播音频', {
      variantIndex: plan.variant.index,
      textLength: plan.voiceover.length,
    });
    const audio = await ctx.modelClient.tts(plan.voiceover);
    await ctx.appendLog?.('info', '素材口播音频生成成功', {
      variantIndex: plan.variant.index,
      audioPath: audio.localPath,
    });
    try {
      await ctx.appendLog?.('info', '开始合成素材视频和口播音频', {
        variantIndex: plan.variant.index,
        videoPath: plan.generatedVideoPath,
        audioPath: audio.localPath,
        outputPath: plan.videoPath,
      });
      await muxAudioVideo(plan.generatedVideoPath, audio.localPath, plan.videoPath);
      await ctx.appendLog?.('info', '素材视频和口播音频合成成功', {
        variantIndex: plan.variant.index,
        outputPath: plan.videoPath,
      });
    } catch (error) {
      const appError = toAppError(error, 'E_FFMPEG_FAILED');
      await ctx.appendLog?.('error', '素材视频和口播音频合成失败', {
        variantIndex: plan.variant.index,
        videoPath: plan.generatedVideoPath,
        audioPath: audio.localPath,
        outputPath: plan.videoPath,
        code: appError.code,
        errorType: errorTypeLabel(appError.code),
        detail: appError.detail ?? appError.message,
        message: appError.message,
      });
      return buildNativeAssetSnapshot({
        plan,
        status: 'failed',
        videoPath: plan.generatedVideoPath,
        audioPath: audio.localPath,
        error: `素材视频和口播音频合成失败：${appError.message}`,
        segments: generatedSegments,
        references: state.references,
        failedAt: Date.now(),
      });
    }
    return buildNativeAssetSnapshot({
      plan,
      status: 'success',
      videoPath: plan.videoPath,
      audioPath: audio.localPath,
      segments: generatedSegments,
      references: state.references,
      completedAt: Date.now(),
    });
  } catch (error) {
    const appError = toAppError(error, 'E_MODEL_API_FAILED');
    await ctx.appendLog?.('error', '素材口播音频生成失败', {
      variantIndex: plan.variant.index,
      code: appError.code,
      errorType: errorTypeLabel(appError.code),
      detail: appError.detail ?? appError.message,
      message: appError.message,
    });
    return buildNativeAssetSnapshot({
      plan,
      status: 'failed',
      videoPath: plan.generatedVideoPath,
      error: appError.message,
      segments: generatedSegments,
      references: state.references,
      failedAt: Date.now(),
    });
  }
}

async function runNativeVariantAssetGeneration(params: {
  ctx: StepContext<NativeInput>;
  state: NativeAssetGenerationState;
  store: NativeAssetStateStore;
  variant: StoryboardVariant;
  referenceVideoPath?: string;
}): Promise<void> {
  const { ctx, state, store, variant, referenceVideoPath } = params;
  const existing = store.getExisting(variant.index);
  if (store.isReusable(variant.index)) {
    await store.markSkipped();
    return;
  }

  const plan = buildVariantPlan(ctx, variant, state.targetDurationSec);
  await ctx.appendLog?.('info', '素材变体分段计划', {
    variantIndex: variant.index,
    title: variant.title,
    targetDurationSec: state.targetDurationSec,
    segmentDurations: plan.segments.map((segment) => segment.durationSec),
    finalVideoPath: plan.videoPath,
    generatedVideoPath: plan.generatedVideoPath,
    audioMode: plan.shouldMuxVoiceover ? 'tts_mux' : 'seedance_generate_audio',
  });

  const generatedSegments = await generateNativeVariantSegments({
    ctx,
    state,
    store,
    plan,
    existing,
    ...(referenceVideoPath !== undefined ? { initialReferenceVideoPath: referenceVideoPath } : {}),
  });
  if (generatedSegments === undefined) {
    return;
  }

  const asset = await composeNativeVariantAsset({ ctx, state, plan, generatedSegments });
  await store.record(asset);
}

async function runAssetGenerator(ctx: StepContext<NativeInput>) {
  const state = await createNativeAssetGenerationState(ctx);
  const previousAssets = await readNativeAssetsIfExists(state.assetsPath);
  const store = new NativeAssetStateStore(state.storyboard, state.assetsPath, previousAssets);
  const limit = pLimit(4);

  await ctx.appendLog?.('info', '素材生成节点初始化', {
    targetDurationSec: state.targetDurationSec,
    variantCount: state.storyboard.variants.length,
    ratio: ctx.input.ratio,
    assetsPath: state.assetsPath,
    hasReferenceVideo: ctx.input.referenceVideoPath !== undefined,
    hasReferenceImages: state.references.referenceImagePaths !== undefined,
    hasReferenceAudio: state.references.referenceAudioPath !== undefined,
  });

  const referenceVideoPath =
    ctx.input.referenceVideoPath !== undefined
      ? await trimVideo(
          ctx.input.referenceVideoPath,
          artifactPath(ctx.artifactDir, 'seedance_reference.mp4'),
          Math.min(state.targetDurationSec, 4),
          seedanceReferenceFilter(ctx.input.ratio),
        )
      : undefined;

  await Promise.all(
    state.storyboard.variants.map((variant) =>
      limit(() =>
        runNativeVariantAssetGeneration({
          ctx,
          state,
          store,
          variant,
          ...(referenceVideoPath !== undefined ? { referenceVideoPath } : {}),
        }),
      ),
    ),
  );

  const assets = store.getAssets();
  const failedAssets = assets.filter((asset) => asset.status === 'failed');
  const artifact = await store.finalize();
  if (failedAssets.length > 0) {
    const summary = failedAssets
      .map((asset) => `${asset.index}「${asset.title}」：${asset.error ?? '未知错误'}`)
      .join('；');
    await ctx.appendLog?.('error', '素材生成节点部分失败', {
      failedCount: failedAssets.length,
      failedAssets: failedAssets.map((asset) => ({
        index: asset.index,
        title: asset.title,
        error: asset.error,
        segments: asset.segments?.map((segment) => ({
          index: segment.index,
          status: segment.status,
          durationSec: segment.durationSec,
          error: segment.error,
          path: segment.path,
        })),
      })),
      assetsPath: state.assetsPath,
    });
    throw new AppError(
      'E_MODEL_API_FAILED',
      `素材生成部分失败，已保留成功结果，重试会跳过成功项。失败明细：${summary}`,
    );
  }
  return { artifactPath: artifact };
}

async function runConsistencyChecker(ctx: StepContext<NativeInput>) {
  const route = await readJson<IndustryRoute>(artifactPath(ctx.artifactDir, 'industry.json'));
  const storyboard = await readJson<StoryboardBundle>(
    artifactPath(ctx.artifactDir, 'storyboard.json'),
  );
  const nativeAssets = await readJson<NativeAssets>(artifactPath(ctx.artifactDir, 'assets.json'));
  const checks: ConsistencyItem[] = [];

  for (const asset of nativeAssets.assets.filter((item) => item.status !== 'failed')) {
    const variant = storyboard.variants.find((item) => item.index === asset.index);
    const response = await ctx.modelClient.visionVideo(
      asset.videoPath,
      workflowPrompt(ctx, 'native.consistency_checker', {
        industryTitle: route.title,
        title: asset.title,
        script: variant?.script ?? '',
        requiredModules: route.requiredModules.join('、'),
        complianceFocus: route.complianceFocus,
      }),
    );
    const check = parseModelJson<Omit<ConsistencyItem, 'index'>>(response, '行业一致性检测');
    checks.push({
      index: asset.index,
      pass: check.pass,
      issues: Array.isArray(check.issues) ? check.issues : [],
      score: typeof check.score === 'number' ? check.score : 0,
      ...(check.scores !== undefined ? { scores: check.scores } : {}),
      ...(check.repairPrompt !== undefined ? { repairPrompt: check.repairPrompt } : {}),
      ...(check.regeneratePolicy !== undefined ? { regeneratePolicy: check.regeneratePolicy } : {}),
      ...(Array.isArray(check.referenceMismatch)
        ? { referenceMismatch: check.referenceMismatch }
        : {}),
    });
  }

  const failed = checks.filter((check) => !check.pass || check.score < 0.6);
  const report: ConsistencyReport = {
    checks,
    summary: {
      total: checks.length,
      passed: checks.length - failed.length,
      warned: failed.length,
      blocking: false,
    },
  };
  const artifact = await writeJson(artifactPath(ctx.artifactDir, 'consistency.json'), report);
  if (failed.length > 0) {
    await ctx.appendLog?.('warn', '成片一致性不足，记录告警后继续输出成片', {
      warningCount: failed.length,
      failedChecks: failed.map((check) => ({
        index: check.index,
        score: check.score,
        issues: check.issues,
        repairPrompt: check.repairPrompt,
        regeneratePolicy: check.regeneratePolicy,
      })),
      artifactPath: artifact,
    });
  }
  return {
    artifactPath: artifact,
  };
}

async function runComposer(ctx: StepContext<NativeInput>) {
  const route = await readJson<IndustryRoute>(artifactPath(ctx.artifactDir, 'industry.json'));
  const storyboard = await readJson<StoryboardBundle>(
    artifactPath(ctx.artifactDir, 'storyboard.json'),
  );
  const nativeAssets = await readJson<NativeAssets>(artifactPath(ctx.artifactDir, 'assets.json'));
  const finalPaths: string[] = [];
  const violations = findComplianceViolations(route, storyboard);
  if (violations.length > 0) {
    throw new AppError('E_INPUT_VALIDATION', `成片合规校验未通过：${violations.join('；')}`);
  }

  for (const asset of nativeAssets.assets.filter((item) => item.status !== 'failed')) {
    const finalPath = artifactPath(ctx.artifactDir, finalFileName(route, asset));
    await copyFile(asset.videoPath, finalPath);
    if (route.hardRules.outputNamePattern) {
      const pattern = new RegExp(route.hardRules.outputNamePattern);
      if (!pattern.test(finalFileName(route, asset))) {
        throw new AppError('E_INPUT_VALIDATION', '小说行业成片命名不符合 AIGC 规范');
      }
    }
    ctx.repository.createAsset({
      taskId: ctx.task.id,
      kind: 'video',
      path: finalPath,
      tags: ['native', route.industry],
    });
    finalPaths.push(finalPath);
  }

  return {
    artifactPath: await writeJson(artifactPath(ctx.artifactDir, 'finals.json'), {
      prompt: workflowPrompt(ctx, 'native.composer_compliance', {
        industryTitle: route.title,
        complianceFocus: route.complianceFocus,
      }),
      finalPaths,
    }),
  };
}

export const nativePipeline: PipelineDefinition<NativeInput> = {
  type: 'native',
  steps: [
    { name: 'industry_router', runStep: runIndustryRouter },
    { name: 'concept_planner', runStep: runConceptPlanner },
    { name: 'script_writer', runStep: runScriptWriter },
    { name: 'script_confirm', runStep: runScriptConfirm },
    { name: 'storyboard_builder', runStep: runStoryboardBuilder },
    { name: 'compliance_pre', runStep: runCompliancePre },
    { name: 'video_prompt_optimize', runStep: runVideoPromptOptimize },
    { name: 'asset_generator', canResume: canResumeAssetGenerator, runStep: runAssetGenerator },
    { name: 'consistency_checker', runStep: runConsistencyChecker },
    { name: 'composer', runStep: runComposer },
  ],
};
