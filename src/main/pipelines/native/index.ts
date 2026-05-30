import { existsSync } from 'node:fs';
import { copyFile } from 'node:fs/promises';

import pLimit from 'p-limit';

import { AppError, toAppError } from '../../errors.js';
import { concatSilentVideos, concatVideos, muxAudioVideo, trimVideo } from '../../media/ffmpeg.js';
import type { NativeIndustry, NativeInput } from '../../../shared/types.js';
import { NATIVE_INDUSTRY_DEFINITIONS } from '../../../shared/workflows.js';
import { errorTypeLabel } from '../task-log.js';
import {
  artifactPath,
  parseModelJson,
  readJson,
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
    audience: string;
    sellingPoints: string[];
    modules: string[];
    cta: string;
    tone: string;
  }>;
}

interface ScriptBundle {
  scripts: Array<{
    index: number;
    title: string;
    script: string;
    voiceover?: string;
    cta: string;
    beats: Array<{ timeSec: number; text: string }>;
  }>;
}

interface StoryboardShot {
  index: number;
  durationSec: number;
  imagePrompt: string;
  videoPrompt: string;
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

interface NativeAsset {
  index: number;
  title: string;
  status?: 'success' | 'failed';
  videoPath: string;
  audioPath?: string;
  error?: string;
  durationSec?: number;
  segments?: NativeAssetSegment[];
  usedReferenceVideo?: boolean;
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
  referenceVideoPath?: string;
  completedAt?: number;
  failedAt?: number;
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
}

interface ConsistencyReport {
  checks: ConsistencyItem[];
}

interface StoryboardSegment {
  index: number;
  shots: StoryboardShot[];
  durationSec: number;
}

const SEEDANCE_MIN_DURATION_SEC = 4;
const SEEDANCE_MAX_DURATION_SEC = 15;

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

function storyboardPromptText(variant: StoryboardVariant): string {
  return variant.shots
    .map(
      (shot) =>
        `镜头 ${shot.index}（${shot.durationSec}s）：${shot.videoPrompt}。场景图：${shot.imagePrompt}。口播参考（仅用于节奏，不生成画面文字）：${shot.voiceoverText ?? ''}。模块：${shot.module ?? ''}`,
    )
    .join('\n');
}

function storyboardSegmentPromptText(segment: StoryboardSegment, segmentCount: number): string {
  const prefix =
    segmentCount > 1
      ? `当前只生成第 ${segment.index}/${segmentCount} 段，片段时长 ${segment.durationSec}s。请与前后片段保持主体、机位、光线、色彩和节奏连续。如本次输入参考视频，请明确参考该视频的主体位置、动作节奏和运镜连续性。\n`
      : '';
  return `${prefix}${segment.shots
    .map(
      (shot) =>
        `镜头 ${shot.index}（${shot.durationSec}s）：${shot.videoPrompt}。场景图：${shot.imagePrompt}。口播参考（仅用于节奏，不生成画面文字）：${shot.voiceoverText ?? ''}。模块：${shot.module ?? ''}`,
    )
    .join('\n')}`;
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
  const normalizedDuration = Math.max(SEEDANCE_MIN_DURATION_SEC, Math.round(durationSec));
  const chunks: number[] = [];
  let remaining = normalizedDuration;
  while (remaining > SEEDANCE_MAX_DURATION_SEC) {
    const remainingAfterMax = remaining - SEEDANCE_MAX_DURATION_SEC;
    const current =
      remainingAfterMax > 0 && remainingAfterMax < SEEDANCE_MIN_DURATION_SEC
        ? SEEDANCE_MAX_DURATION_SEC - (SEEDANCE_MIN_DURATION_SEC - remainingAfterMax)
        : SEEDANCE_MAX_DURATION_SEC;
    chunks.push(current);
    remaining -= current;
  }
  if (remaining > 0) {
    chunks.push(remaining);
  }
  return chunks;
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
  return waitForScriptConfirmation(ctx, 'scripts.md', '原生爆款素材脚本文案');
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

async function runAssetGenerator(ctx: StepContext<NativeInput>) {
  const route = await readJson<IndustryRoute>(artifactPath(ctx.artifactDir, 'industry.json'));
  const storyboard = await readJson<StoryboardBundle>(
    artifactPath(ctx.artifactDir, 'storyboard.json'),
  );
  const limit = pLimit(4);
  const targetDurationSec = Math.max(SEEDANCE_MIN_DURATION_SEC, Math.round(ctx.input.durationSec));
  const assetsPath = artifactPath(ctx.artifactDir, 'assets.json');
  const previousAssets = await readNativeAssetsIfExists(assetsPath);
  const results = new Map<number, NativeAsset>(
    previousAssets?.assets.map((asset) => [asset.index, asset]) ?? [],
  );
  let skipped = 0;

  await ctx.appendLog?.('info', '素材生成节点初始化', {
    targetDurationSec,
    variantCount: storyboard.variants.length,
    ratio: ctx.input.ratio,
    assetsPath,
    hasReferenceVideo: ctx.input.referenceVideoPath !== undefined,
  });

  async function persistResults(): Promise<void> {
    const ordered = storyboard.variants
      .map((variant) => results.get(variant.index))
      .filter((asset): asset is NativeAsset => asset !== undefined);
    await writeJson(
      assetsPath,
      buildNativeAssetsReport(ordered, storyboard.variants.length, skipped),
    );
  }

  const referenceVideoPath =
    ctx.input.referenceVideoPath !== undefined
      ? await trimVideo(
          ctx.input.referenceVideoPath,
          artifactPath(ctx.artifactDir, 'seedance_reference.mp4'),
          Math.min(targetDurationSec, 4),
          seedanceReferenceFilter(ctx.input.ratio),
        )
      : undefined;
  await Promise.all(
    storyboard.variants.map((variant) =>
      limit(async (): Promise<void> => {
        const existing = results.get(variant.index);
        if (isReusableNativeAsset(existing)) {
          skipped += 1;
          await persistResults();
          return;
        }

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
        const segments = splitVariantForSeedance(variant, targetDurationSec);
        await ctx.appendLog?.('info', '素材变体分段计划', {
          variantIndex: variant.index,
          title: variant.title,
          targetDurationSec,
          segmentDurations: segments.map((segment) => segment.durationSec),
          finalVideoPath: videoPath,
          generatedVideoPath,
          audioMode: shouldMuxVoiceover ? 'tts_mux' : 'seedance_generate_audio',
        });
        const previousSegments = new Map<number, NativeAssetSegment>(
          existing?.segments?.map((segment) => [segment.index, segment]) ?? [],
        );
        const generatedSegments: NativeAssetSegment[] = [];
        let nextReferencePath = referenceVideoPath;
        let segmentFailure: NativeAssetSegment | undefined;

        for (const segment of segments) {
          const previousSegment = previousSegments.get(segment.index);
          if (isReusableNativeSegment(previousSegment)) {
            await ctx.appendLog?.('info', '复用已成功的视频片段', {
              variantIndex: variant.index,
              segmentIndex: segment.index,
              durationSec: previousSegment.durationSec,
              path: previousSegment.path,
            });
            generatedSegments.push(previousSegment);
            nextReferencePath = previousSegment.path;
            continue;
          }

          const segmentPath =
            segments.length > 1
              ? artifactPath(
                  ctx.artifactDir,
                  `asset_variant_${variant.index}_part_${segment.index}.mp4`,
                )
              : generatedVideoPath;
          const videoRequest = {
            prompt: workflowPrompt(ctx, 'native.asset_generator', {
              industryTitle: route.title,
              title: variant.title,
              script: variant.script,
              storyboard:
                segments.length > 1
                  ? storyboardSegmentPromptText(segment, segments.length)
                  : storyboardPromptText(variant),
              ratio: ctx.input.ratio,
            }),
            durationSec: segment.durationSec,
            resolution: ctx.input.ratio === '16:9' ? '1080p' : '720p',
            ratio: ctx.input.ratio,
            generateAudio: !shouldMuxVoiceover,
            outputPath: segmentPath,
            ...(nextReferencePath !== undefined ? { refVideoPath: nextReferencePath } : {}),
          };
          let usedReferenceVideo = nextReferencePath !== undefined;
          await ctx.appendLog?.('info', '开始调用 Seedance 生成视频片段', {
            variantIndex: variant.index,
            segmentIndex: segment.index,
            segmentCount: segments.length,
            durationSec: segment.durationSec,
            resolution: videoRequest.resolution,
            generateAudio: videoRequest.generateAudio,
            outputPath: segmentPath,
            hasReferenceVideo: nextReferencePath !== undefined,
            referenceVideoPath: nextReferencePath,
          });
          try {
            await ctx.modelClient.generateVideo(videoRequest);
          } catch (error) {
            if (nextReferencePath === undefined || !isReferenceVideoRejected(error)) {
              const appError = toAppError(error, 'E_MODEL_API_FAILED');
              await ctx.appendLog?.('error', 'Seedance 视频片段生成失败', {
                variantIndex: variant.index,
                title: variant.title,
                segmentIndex: segment.index,
                segmentCount: segments.length,
                durationSec: segment.durationSec,
                outputPath: segmentPath,
                code: appError.code,
                errorType: errorTypeLabel(appError.code),
                detail: appError.detail ?? appError.message,
                message: appError.message,
              });
              segmentFailure = {
                index: segment.index,
                status: 'failed',
                path: segmentPath,
                durationSec: segment.durationSec,
                error: appError.message,
                usedReferenceVideo,
                ...(nextReferencePath !== undefined
                  ? { referenceVideoPath: nextReferencePath }
                  : {}),
                failedAt: Date.now(),
              };
              generatedSegments.push(segmentFailure);
              break;
            }
            usedReferenceVideo = false;
            await ctx.appendLog?.('warn', '参考视频被 Seedance 拒绝，改为无参考视频重试', {
              variantIndex: variant.index,
              segmentIndex: segment.index,
              durationSec: segment.durationSec,
              referenceVideoPath: nextReferencePath,
              error: error instanceof Error ? error.message : String(error),
            });
            try {
              await ctx.modelClient.generateVideo({
                prompt: videoRequest.prompt,
                durationSec: videoRequest.durationSec,
                resolution: videoRequest.resolution,
                ratio: videoRequest.ratio,
                generateAudio: videoRequest.generateAudio,
                outputPath: videoRequest.outputPath,
              });
            } catch (fallbackError) {
              const appError = toAppError(fallbackError, 'E_MODEL_API_FAILED');
              await ctx.appendLog?.('error', 'Seedance 无参考视频重试失败', {
                variantIndex: variant.index,
                title: variant.title,
                segmentIndex: segment.index,
                segmentCount: segments.length,
                durationSec: segment.durationSec,
                outputPath: segmentPath,
                code: appError.code,
                errorType: errorTypeLabel(appError.code),
                detail: appError.detail ?? appError.message,
                message: appError.message,
              });
              segmentFailure = {
                index: segment.index,
                status: 'failed',
                path: segmentPath,
                durationSec: segment.durationSec,
                error: `参考视频被拒后无参考重试仍失败：${appError.message}`,
                usedReferenceVideo,
                ...(nextReferencePath !== undefined
                  ? { referenceVideoPath: nextReferencePath }
                  : {}),
                failedAt: Date.now(),
              };
              generatedSegments.push(segmentFailure);
              break;
            }
          }

          const generatedSegment: NativeAssetSegment = {
            index: segment.index,
            status: 'success',
            path: segmentPath,
            durationSec: segment.durationSec,
            usedReferenceVideo,
            ...(nextReferencePath !== undefined ? { referenceVideoPath: nextReferencePath } : {}),
            completedAt: Date.now(),
          };
          await ctx.appendLog?.('info', 'Seedance 视频片段生成成功', {
            variantIndex: variant.index,
            segmentIndex: segment.index,
            segmentCount: segments.length,
            durationSec: segment.durationSec,
            outputPath: segmentPath,
            usedReferenceVideo,
          });
          generatedSegments.push(generatedSegment);
          nextReferencePath = segmentPath;
          results.set(variant.index, {
            index: variant.index,
            title: variant.title,
            status: 'failed',
            videoPath: generatedVideoPath,
            error: `第 ${segment.index}/${segments.length} 段已生成，等待剩余片段`,
            durationSec: generatedSegments.reduce((total, item) => total + item.durationSec, 0),
            segments: generatedSegments,
            usedReferenceVideo: generatedSegments.some((item) => item.usedReferenceVideo),
            failedAt: Date.now(),
          });
          await persistResults();
        }

        if (segmentFailure !== undefined) {
          results.set(variant.index, {
            index: variant.index,
            title: variant.title,
            status: 'failed',
            videoPath: generatedVideoPath,
            error: `第 ${segmentFailure.index}/${segments.length} 段生成失败：${segmentFailure.error ?? '未知错误'}`,
            durationSec: generatedSegments.reduce((total, item) => total + item.durationSec, 0),
            segments: generatedSegments,
            usedReferenceVideo: generatedSegments.some((item) => item.usedReferenceVideo),
            failedAt: Date.now(),
          });
          await persistResults();
          return;
        }

        try {
          if (generatedSegments.length > 1 && !existsSync(generatedVideoPath)) {
            await ctx.appendLog?.('info', '开始拼接 Seedance 视频片段', {
              variantIndex: variant.index,
              segmentPaths: generatedSegments.map((segment) => segment.path),
              outputPath: generatedVideoPath,
              audioMode: shouldMuxVoiceover ? 'drop_segment_audio_for_tts' : 'keep_seedance_audio',
            });
            if (shouldMuxVoiceover) {
              await concatSilentVideos(
                generatedSegments.map((segment) => segment.path),
                generatedVideoPath,
              );
            } else {
              await concatVideos(
                generatedSegments.map((segment) => segment.path),
                generatedVideoPath,
              );
            }
            await ctx.appendLog?.('info', 'Seedance 视频片段拼接成功', {
              variantIndex: variant.index,
              outputPath: generatedVideoPath,
            });
          }
        } catch (error) {
          const appError = toAppError(error, 'E_FFMPEG_FAILED');
          await ctx.appendLog?.('error', 'Seedance 视频片段拼接失败', {
            variantIndex: variant.index,
            segmentPaths: generatedSegments.map((segment) => segment.path),
            outputPath: generatedVideoPath,
            code: appError.code,
            errorType: errorTypeLabel(appError.code),
            detail: appError.detail ?? appError.message,
            message: appError.message,
          });
          results.set(variant.index, {
            index: variant.index,
            title: variant.title,
            status: 'failed',
            videoPath: generatedVideoPath,
            error: `片段拼接失败：${appError.message}`,
            durationSec: generatedSegments.reduce((total, item) => total + item.durationSec, 0),
            segments: generatedSegments,
            usedReferenceVideo: generatedSegments.some((item) => item.usedReferenceVideo),
            failedAt: Date.now(),
          });
          await persistResults();
          return;
        }

        if (!shouldMuxVoiceover) {
          await ctx.appendLog?.('info', '素材无口播文本，使用 Seedance 自带音频输出', {
            variantIndex: variant.index,
            videoPath,
          });
          results.set(variant.index, {
            index: variant.index,
            title: variant.title,
            status: 'success',
            videoPath,
            durationSec: generatedSegments.reduce((total, item) => total + item.durationSec, 0),
            segments: generatedSegments,
            usedReferenceVideo: generatedSegments.some((item) => item.usedReferenceVideo),
            completedAt: Date.now(),
          });
          await persistResults();
          return;
        }
        const reusableSingleSegmentPath =
          generatedSegments.length === 1 ? generatedSegments[0]?.path : undefined;
        if (
          reusableSingleSegmentPath !== undefined &&
          reusableSingleSegmentPath !== generatedVideoPath &&
          existsSync(reusableSingleSegmentPath) &&
          !existsSync(generatedVideoPath)
        ) {
          await ctx.appendLog?.('info', '复制已复用视频片段为口播合成工作文件', {
            variantIndex: variant.index,
            sourcePath: reusableSingleSegmentPath,
            generatedVideoPath,
          });
          await copyFile(reusableSingleSegmentPath, generatedVideoPath);
        }
        try {
          await ctx.appendLog?.('info', '开始生成素材口播音频', {
            variantIndex: variant.index,
            textLength: voiceover.length,
          });
          const audio = await ctx.modelClient.tts(voiceover);
          await ctx.appendLog?.('info', '素材口播音频生成成功', {
            variantIndex: variant.index,
            audioPath: audio.localPath,
          });
          try {
            await ctx.appendLog?.('info', '开始合成素材视频和口播音频', {
              variantIndex: variant.index,
              videoPath: generatedVideoPath,
              audioPath: audio.localPath,
              outputPath: videoPath,
            });
            await muxAudioVideo(generatedVideoPath, audio.localPath, videoPath);
            await ctx.appendLog?.('info', '素材视频和口播音频合成成功', {
              variantIndex: variant.index,
              outputPath: videoPath,
            });
          } catch (error) {
            const appError = toAppError(error, 'E_FFMPEG_FAILED');
            await ctx.appendLog?.('error', '素材视频和口播音频合成失败', {
              variantIndex: variant.index,
              videoPath: generatedVideoPath,
              audioPath: audio.localPath,
              outputPath: videoPath,
              code: appError.code,
              errorType: errorTypeLabel(appError.code),
              detail: appError.detail ?? appError.message,
              message: appError.message,
            });
            results.set(variant.index, {
              index: variant.index,
              title: variant.title,
              status: 'failed',
              videoPath: generatedVideoPath,
              audioPath: audio.localPath,
              error: `素材视频和口播音频合成失败：${appError.message}`,
              durationSec: generatedSegments.reduce((total, item) => total + item.durationSec, 0),
              segments: generatedSegments,
              usedReferenceVideo: generatedSegments.some((item) => item.usedReferenceVideo),
              failedAt: Date.now(),
            });
            await persistResults();
            return;
          }
          results.set(variant.index, {
            index: variant.index,
            title: variant.title,
            status: 'success',
            videoPath,
            audioPath: audio.localPath,
            durationSec: generatedSegments.reduce((total, item) => total + item.durationSec, 0),
            segments: generatedSegments,
            usedReferenceVideo: generatedSegments.some((item) => item.usedReferenceVideo),
            completedAt: Date.now(),
          });
          await persistResults();
        } catch (error) {
          const appError = toAppError(error, 'E_MODEL_API_FAILED');
          await ctx.appendLog?.('error', '素材口播音频生成失败', {
            variantIndex: variant.index,
            code: appError.code,
            errorType: errorTypeLabel(appError.code),
            detail: appError.detail ?? appError.message,
            message: appError.message,
          });
          results.set(variant.index, {
            index: variant.index,
            title: variant.title,
            status: 'failed',
            videoPath: generatedVideoPath,
            error: appError.message,
            durationSec: generatedSegments.reduce((total, item) => total + item.durationSec, 0),
            segments: generatedSegments,
            usedReferenceVideo: generatedSegments.some((item) => item.usedReferenceVideo),
            failedAt: Date.now(),
          });
          await persistResults();
        }
      }),
    ),
  );
  const assets = storyboard.variants
    .map((variant) => results.get(variant.index))
    .filter((asset): asset is NativeAsset => asset !== undefined);
  const failedAssets = assets.filter((asset) => asset.status === 'failed');
  const artifact = await writeJson(
    assetsPath,
    buildNativeAssetsReport(assets, storyboard.variants.length, skipped),
  );
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
      assetsPath,
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
    });
  }

  const failed = checks.filter((check) => !check.pass || check.score < 0.6);
  if (failed.length > 0) {
    throw new AppError(
      'E_LOW_CONFIDENCE',
      `成片一致性不足：${failed.map((check) => `${check.index}:${check.issues.join('/')}`).join('；')}`,
    );
  }

  const report: ConsistencyReport = { checks };
  return {
    artifactPath: await writeJson(artifactPath(ctx.artifactDir, 'consistency.json'), report),
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
    { name: 'asset_generator', runStep: runAssetGenerator },
    { name: 'consistency_checker', runStep: runConsistencyChecker },
    { name: 'composer', runStep: runComposer },
  ],
};
