import { existsSync } from 'node:fs';

import { AppError } from '../../errors.js';
import { downloadDouyinVideo } from '../../media/douyin.js';
import {
  concatSilentVideos,
  extractAudio,
  normalizeVideo,
  trimVideo,
} from '../../media/ffmpeg.js';
import type { SeedanceVideoRequest, TranscriptResult } from '../../model-client/index.js';
import { DEFAULT_VIDEO_RESOLUTION, type ExplosionInput } from '../../../shared/types.js';
import {
  artifactPath,
  buildReferencePolicyText,
  buildSeedancePromptCard,
  normalizeSeedanceGenerationDuration,
  parseModelJson,
  readJson,
  SEEDANCE_MAX_GENERATION_DURATION_SEC,
  splitDurationForSeedanceGeneration,
  waitForScriptConfirmation,
  workflowPrompt,
  writeJson,
  writeText,
} from '../helpers.js';
import type { PipelineDefinition, StepContext } from '../types.js';

interface StoryboardShot {
  index: number;
  durationSec?: number;
  visualPrompt: string;
  narration?: string;
  dialogue?: string;
  voiceover?: string;
  voiceoverText?: string;
  spokenText?: string;
  speaker?: string;
  voiceGender?: ExplosionVoiceGender;
  speakerGender?: ExplosionVoiceGender;
  transition?: string;
  visualAnchor?: string;
  behaviorState?: string;
  localTone?: string;
  videoTheme?: string;
}

interface ScriptParse {
  cta_keywords: string[];
  scenes: StoryboardShot[];
  selling_points?: string[];
  hookFormula?: string;
  hook_formula?: string;
  conversion_triggers?: string[];
  rhythm?: string;
  original_script?: string;
  highValueSegments?: Array<{ timeRange: string; reason: string; preserve?: string }>;
  replaceableSegments?: Array<{ timeRange: string; reason: string }>;
  similarityRisk?: 'low' | 'medium' | 'high';
  referencePolicy?: string;
  riskNotes?: string[];
}

interface Variant {
  index: number;
  strategy?:
    | 'shot_replace'
    | 'avatar_replace'
    | 'product_shot_replace'
    | 'pretrailer_add'
    | 'hot_opening_reuse'
    | 'remix';
  copy: string;
  script: string;
  preserve?: string[];
  replace?: string[];
  differenceTarget?: string;
  variantReason?: string;
  storyboard: StoryboardShot[];
}

function normalizeKeywordText(value: string) {
  return value
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[，。！？、,.!?;；:"'“”‘’（）()【】[\]{}<>《》\-—_]/g, '');
}

function variantText(variant: Variant) {
  return `${variant.copy}\n${variant.script}\n${JSON.stringify(variant.storyboard)}`;
}

function missingCtaKeywordsForVariant(variant: Variant, ctaKeywords: string[]) {
  const normalizedVariantText = normalizeKeywordText(variantText(variant));
  return ctaKeywords.filter((keyword) => {
    const normalizedKeyword = normalizeKeywordText(keyword);
    return normalizedKeyword.length > 0 && !normalizedVariantText.includes(normalizedKeyword);
  });
}

interface GeneratedVideoOutput {
  index: number;
  path: string;
  usedReferenceVideo: boolean;
  durationSec: number;
  segments: GeneratedVideoSegment[];
}

interface GeneratedVideoSegment {
  index: number;
  path: string;
  durationSec: number;
  usedReferenceVideo: boolean;
  referenceVideoPath?: string;
}

interface ExplosionVideoPromptSegment {
  index: number;
  durationSec: number;
  prompt: string;
  noReferencePrompt: string;
}

interface ExplosionVideoPromptVariant {
  index: number;
  segments: ExplosionVideoPromptSegment[];
}

interface ExplosionVideoPrompts {
  variants: ExplosionVideoPromptVariant[];
}

type ExplosionVoiceGender = 'female' | 'male';

function isReferenceVideoRejected(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /InputVideoSensitiveContentDetected|real person|reference_video|video duration|video pixel/iu.test(message);
}

const DEFAULT_SHOT_DURATION_SEC = 2;

function transcriptTextForPrompt(transcript: TranscriptResult): string {
  return transcript.text.trim().length > 0
    ? transcript.text
    : '（ASR 未识别到有效人声，原视频可能为静音或只有音乐。请仅基于视频画面、字幕和视觉节奏理解脚本结构。）';
}

function normalizeShotDuration(shot: StoryboardShot): number {
  if (shot.durationSec === undefined || !Number.isFinite(shot.durationSec) || shot.durationSec <= 0) {
    return DEFAULT_SHOT_DURATION_SEC;
  }
  return Math.max(1, Math.round(shot.durationSec));
}

interface StoryboardSegment {
  index: number;
  shots: StoryboardShot[];
  durationSec: number;
}

function splitLongShot(shot: StoryboardShot, durationSec: number): StoryboardShot[] {
  const durations = splitDurationForSeedanceGeneration(durationSec);
  return durations.map((partDuration, index) => {
    const partIndex = index + 1;
    return {
      ...shot,
      index: index === 0 ? shot.index : Number(`${shot.index}${partIndex}`),
      durationSec: partDuration,
      visualPrompt:
        index === 0
          ? shot.visualPrompt
          : `${shot.visualPrompt}（延续镜头 ${shot.index} 的第 ${partIndex} 段，保持动作和构图连续。）`,
    };
  });
}

function splitStoryboardForSeedance(storyboard: StoryboardShot[]): StoryboardSegment[] {
  const segments: StoryboardSegment[] = [];
  let currentShots: StoryboardShot[] = [];
  let currentDuration = 0;

  function flushCurrent(): void {
    if (currentShots.length === 0) {
      return;
    }
    segments.push({
      index: segments.length + 1,
      shots: currentShots,
      durationSec: normalizeSeedanceGenerationDuration(currentDuration),
    });
    currentShots = [];
    currentDuration = 0;
  }

  for (const shot of storyboard) {
    const shotParts = splitLongShot(shot, normalizeShotDuration(shot));
    for (const shotPart of shotParts) {
      const partDuration = normalizeShotDuration(shotPart);
      if (
        currentShots.length > 0 &&
        currentDuration + partDuration > SEEDANCE_MAX_GENERATION_DURATION_SEC
      ) {
        flushCurrent();
      }
      currentShots.push(shotPart);
      currentDuration += partDuration;
    }
  }

  flushCurrent();
  return segments;
}

function buildStoryboardPrompt(
  shots: StoryboardShot[],
  segmentIndex: number,
  segmentCount: number,
  referencePolicy: string,
): string {
  const segmentPrefix =
    segmentCount > 1
      ? `当前仅生成第 ${segmentIndex}/${segmentCount} 段，需与前后段在主体位置、动作节奏、色彩和情绪上连续。`
      : undefined;
  const storyboardText = shots
    .map(
      (shot) =>
        `镜头 ${shot.index}（${normalizeShotDuration(shot)}s）：${shot.visualPrompt}。旁白/字幕：${shot.narration ?? ''}。转场：${shot.transition ?? ''}`,
    )
    .join('\n');
  return buildSeedancePromptCard({
    outputGoal: '广告爆款裂变，保留高转化结构并生成差异化画面',
    ratio: '9:16',
    durationSec: normalizeSeedanceGenerationDuration(
      shots.reduce((total, shot) => total + normalizeShotDuration(shot), 0),
    ),
    visualAnchor: shots.map((shot) => shot.visualAnchor ?? shot.visualPrompt).join('；'),
    behaviorState: shots.map((shot) => shot.behaviorState ?? shot.visualPrompt).join('；'),
    localTone: shots.map((shot) => shot.localTone ?? shot.transition ?? '节奏紧凑，情绪服务首秒停留和转化').join('；'),
    videoTheme: shots.map((shot) => shot.videoTheme ?? '爆款结构裂变广告素材').join('；'),
    referencePolicy,
    sourceText: storyboardText,
    segmentNote: segmentPrefix,
  });
}

async function runDownload(ctx: StepContext<ExplosionInput>) {
  const douyinCookie = ctx.repository.getSetting('douyinCookie');
  const result =
    ctx.input.sourceVideoPath !== undefined
      ? {
          sourceVideoPath: await normalizeVideo(
            ctx.input.sourceVideoPath,
            artifactPath(ctx.artifactDir, 'source.mp4'),
          ),
          sourceAudioPath: await extractAudio(
            artifactPath(ctx.artifactDir, 'source.mp4'),
            artifactPath(ctx.artifactDir, 'source.m4a'),
          ),
          metaPath: artifactPath(ctx.artifactDir, 'meta.json'),
        }
      : douyinCookie !== undefined
        ? await downloadDouyinVideo(ctx.input.douyinUrl ?? '', ctx.artifactDir, {
            cookieHeader: douyinCookie,
          })
        : await downloadDouyinVideo(ctx.input.douyinUrl ?? '', ctx.artifactDir);
  await writeJson(result.metaPath, {
    source: ctx.input.sourceVideoPath ?? ctx.input.douyinUrl,
    sourceType: ctx.input.sourceVideoPath !== undefined ? 'local' : 'douyin',
    sourceVideoPath: result.sourceVideoPath,
    sourceAudioPath: result.sourceAudioPath,
    warnings: [],
    preparedAt: Date.now(),
  });
  return { artifactPath: result.metaPath };
}

async function runAsr(ctx: StepContext<ExplosionInput>) {
  const transcript = await ctx.modelClient.asr(artifactPath(ctx.artifactDir, 'source.m4a'));
  return {
    artifactPath: await writeJson(artifactPath(ctx.artifactDir, 'transcript.json'), transcript),
  };
}

async function runScriptParse(ctx: StepContext<ExplosionInput>) {
  const transcript = await readJson<TranscriptResult>(
    artifactPath(ctx.artifactDir, 'transcript.json'),
  );
  const analysis = await ctx.modelClient.visionVideo(
    artifactPath(ctx.artifactDir, 'source.mp4'),
    workflowPrompt(ctx, 'explosion.script_parse', {
      transcriptText: transcriptTextForPrompt(transcript),
    }),
  );
  const scriptParse = parseModelJson<ScriptParse>(analysis, '爆款分镜解析');
  if (!Array.isArray(scriptParse.cta_keywords) || !Array.isArray(scriptParse.scenes)) {
    throw new AppError('E_MODEL_API_FAILED', '爆款分镜解析缺少必要字段');
  }
  if (scriptParse.scenes.length === 0 || scriptParse.scenes.some((scene) => !scene.visualPrompt)) {
    throw new AppError('E_MODEL_API_FAILED', '爆款分镜解析缺少分镜画面描述');
  }
  return {
    artifactPath: await writeJson(artifactPath(ctx.artifactDir, 'script_parse.json'), scriptParse),
  };
}

async function runRewrite(ctx: StepContext<ExplosionInput>) {
  const transcript = await readJson<TranscriptResult>(
    artifactPath(ctx.artifactDir, 'transcript.json'),
  );
  const scriptParse = await readJson<ScriptParse>(
    artifactPath(ctx.artifactDir, 'script_parse.json'),
  );
  const response = await ctx.modelClient.chat(
    [
      {
        role: 'system',
        content:
          '你是短视频广告编导。先在内部分析裂变策略，不输出推理链；只输出合法 JSON 数组，每项包含 index、strategy、copy、script、preserve、replace、differenceTarget、variantReason、storyboard。',
      },
      {
        role: 'user',
        content: workflowPrompt(ctx, 'explosion.rewrite', {
          variantCount: ctx.input.variantCount,
          ctaKeywords: scriptParse.cta_keywords.join(','),
          transcriptText: transcriptTextForPrompt(transcript),
          scriptParseJson: JSON.stringify(scriptParse),
        }),
      },
    ],
    { temperature: 0.8 },
  );
  const variants = parseModelJson<Variant[]>(response, '爆款裂变文案');
  if (!Array.isArray(variants) || variants.length === 0) {
    throw new AppError('E_MODEL_API_FAILED', '爆款裂变文案为空');
  }
  if (
    variants.some(
      (variant) =>
        !variant.script || !Array.isArray(variant.storyboard) || variant.storyboard.length === 0,
    )
  ) {
    throw new AppError('E_MODEL_API_FAILED', '爆款裂变结果缺少脚本或分镜');
  }
  const ctaWarnings = variants
    .map((variant) => ({
      index: variant.index,
      missingKeywords: missingCtaKeywordsForVariant(variant, scriptParse.cta_keywords),
    }))
    .filter((item) => item.missingKeywords.length > 0);
  if (ctaWarnings.length > 0) {
    await ctx.appendLog?.('warn', '裂变改写未逐字保留部分 CTA 关键词，进入脚本文案确认环节复核', {
      variants: ctaWarnings,
    });
  }
  await writeText(
    artifactPath(ctx.artifactDir, 'variants.md'),
    variants
      .map((item) => {
        const storyboard = item.storyboard
          .map(
            (shot) =>
              `${shot.index}. ${shot.durationSec ?? '-'}s ${shot.visualPrompt}\n   旁白：${shot.narration ?? ''}\n   转场：${shot.transition ?? ''}`,
          )
          .join('\n');
        return `## Variant ${item.index}\n\n${item.copy}\n\n${item.script}\n\n### Storyboard\n\n${storyboard}`;
      })
      .join('\n\n'),
  );
  return {
    artifactPath: await writeJson(artifactPath(ctx.artifactDir, 'variants.json'), variants),
  };
}

async function runScriptConfirm(ctx: StepContext<ExplosionInput>) {
  return waitForScriptConfirmation(ctx, 'variants.md', '爆款裂变脚本文案');
}

async function runVideoPromptOptimize(ctx: StepContext<ExplosionInput>) {
  const variants = await readJson<Variant[]>(artifactPath(ctx.artifactDir, 'variants.json'));
  const scriptParsePath = artifactPath(ctx.artifactDir, 'script_parse.json');
  const scriptParse = existsSync(scriptParsePath)
    ? await readJson<ScriptParse>(scriptParsePath)
    : undefined;
  const promptVariants: ExplosionVideoPromptVariant[] = [];

  for (const variant of variants) {
    const segments = splitStoryboardForSeedance(variant.storyboard);
    const promptSegments: ExplosionVideoPromptSegment[] = [];
    for (const segment of segments) {
      const referencePolicy = buildReferencePolicyText({
        hasReferenceVideo: true,
        purpose: scriptParse?.referencePolicy ?? '爆款裂变生成：保留原片结构、节奏和转化触发点，替换非核心画面。',
      });
      const noReferencePolicy = buildReferencePolicyText({
        purpose: '爆款裂变无参考视频生成：只基于脚本和分镜生成差异化广告画面。',
        noReferenceFallback: '当前参考视频不可用或被模型拒绝，只基于脚本、分镜和爆款结构生成，不要声称参考了视频。',
      });
      promptSegments.push({
        index: segment.index,
        durationSec: segment.durationSec,
        prompt: workflowPrompt(ctx, 'explosion.seedance', {
          copy: variant.copy,
          script: variant.script,
          storyboard: buildStoryboardPrompt(
            segment.shots,
            segment.index,
            segments.length,
            referencePolicy,
          ),
          referencePolicy,
        }),
        noReferencePrompt: workflowPrompt(ctx, 'explosion.seedance', {
          copy: variant.copy,
          script: variant.script,
          storyboard: buildStoryboardPrompt(
            segment.shots,
            segment.index,
            segments.length,
            noReferencePolicy,
          ),
          referencePolicy: noReferencePolicy,
        }),
      });
    }
    promptVariants.push({ index: variant.index, segments: promptSegments });
  }

  return {
    artifactPath: await writeJson(artifactPath(ctx.artifactDir, 'video_prompts.json'), {
      variants: promptVariants,
    }),
  };
}

async function runSeedance(ctx: StepContext<ExplosionInput>) {
  const variants = await readJson<Variant[]>(artifactPath(ctx.artifactDir, 'variants.json'));
  const scriptParsePath = artifactPath(ctx.artifactDir, 'script_parse.json');
  const scriptParse = existsSync(scriptParsePath)
    ? await readJson<ScriptParse>(scriptParsePath)
    : undefined;
  const videoPromptsPath = artifactPath(ctx.artifactDir, 'video_prompts.json');
  const videoPrompts = existsSync(videoPromptsPath)
    ? await readJson<ExplosionVideoPrompts>(videoPromptsPath)
    : undefined;
  const referencePath = await trimVideo(
    artifactPath(ctx.artifactDir, 'source.mp4'),
    artifactPath(ctx.artifactDir, 'seedance_reference.mp4'),
    4,
    'scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280',
  );
  const outputs: GeneratedVideoOutput[] = [];
  for (const variant of variants) {
    const segments = splitStoryboardForSeedance(variant.storyboard);
    const finalOutputPath = artifactPath(ctx.artifactDir, `variant_${variant.index}.mp4`);
    const generatedSegments: GeneratedVideoSegment[] = [];
    let nextReferencePath: string | undefined = referencePath;

    for (const segment of segments) {
      const isSplit = segments.length > 1;
      const outputPath = isSplit
        ? artifactPath(ctx.artifactDir, `variant_${variant.index}_part_${segment.index}.mp4`)
        : finalOutputPath;
      const durationSec = segment.durationSec;
      const resolution = ctx.input.resolution ?? DEFAULT_VIDEO_RESOLUTION;
      const referencePolicy = buildReferencePolicyText({
        hasReferenceVideo: nextReferencePath !== undefined,
        purpose: scriptParse?.referencePolicy ?? '爆款裂变生成：保留原片结构、节奏和转化触发点，替换非核心画面。',
      });
      const noReferencePolicy = buildReferencePolicyText({
        purpose: '爆款裂变无参考视频生成：只基于脚本和分镜生成差异化广告画面。',
        noReferenceFallback: '当前参考视频不可用或被模型拒绝，只基于脚本、分镜和爆款结构生成，不要声称参考了视频。',
      });
      const optimizedSegment = videoPrompts?.variants
        .find((item) => item.index === variant.index)
        ?.segments.find((item) => item.index === segment.index);
      const request: SeedanceVideoRequest = {
        ...(nextReferencePath !== undefined ? { refVideoPath: nextReferencePath } : {}),
        prompt:
          optimizedSegment?.prompt ??
          workflowPrompt(ctx, 'explosion.seedance', {
            copy: variant.copy,
            script: variant.script,
            storyboard: buildStoryboardPrompt(
              segment.shots,
              segment.index,
              segments.length,
              referencePolicy,
            ),
            referencePolicy,
          }),
        durationSec,
        resolution,
        ratio: '9:16',
        generateAudio: true,
        outputPath,
      };
      let usedReferenceVideo = nextReferencePath !== undefined;
      let usedReferenceVideoPath: string | undefined = nextReferencePath;
      try {
        await ctx.modelClient.generateVideo(request);
      } catch (error) {
        if (!isReferenceVideoRejected(error)) {
          throw error;
        }
        usedReferenceVideo = false;
        usedReferenceVideoPath = undefined;
        await ctx.modelClient.generateVideo({
          prompt:
            optimizedSegment?.noReferencePrompt ??
            workflowPrompt(ctx, 'explosion.seedance', {
              copy: variant.copy,
              script: variant.script,
              storyboard: buildStoryboardPrompt(
                segment.shots,
                segment.index,
                segments.length,
                noReferencePolicy,
              ),
              referencePolicy: noReferencePolicy,
            }),
          durationSec,
          resolution,
          ratio: request.ratio ?? '9:16',
          generateAudio: true,
          outputPath,
        });
      }

      generatedSegments.push({
        index: segment.index,
        path: request.outputPath,
        durationSec,
        usedReferenceVideo,
        ...(usedReferenceVideoPath !== undefined ? { referenceVideoPath: usedReferenceVideoPath } : {}),
      });
      nextReferencePath = request.outputPath;
    }

    if (generatedSegments.length > 1) {
      await concatSilentVideos(
        generatedSegments.map((segment) => segment.path),
        finalOutputPath,
      );
    }
    ctx.repository.createAsset({
      taskId: ctx.task.id,
      kind: 'video',
      path: finalOutputPath,
      tags: ['explosion'],
    });
    outputs.push({
      index: variant.index,
      path: finalOutputPath,
      usedReferenceVideo: generatedSegments.every((segment) => segment.usedReferenceVideo),
      durationSec: generatedSegments.reduce((total, segment) => total + segment.durationSec, 0),
      segments: generatedSegments,
    });
  }
  return {
    artifactPath: await writeJson(artifactPath(ctx.artifactDir, 'seedance_outputs.json'), outputs),
  };
}

export const explosionPipeline: PipelineDefinition<ExplosionInput> = {
  type: 'explosion',
  steps: [
    { name: 'download', runStep: runDownload },
    { name: 'asr', runStep: runAsr },
    { name: 'script_parse', runStep: runScriptParse },
    { name: 'rewrite', runStep: runRewrite },
    { name: 'script_confirm', runStep: runScriptConfirm },
    { name: 'video_prompt_optimize', runStep: runVideoPromptOptimize },
    { name: 'seedance', runStep: runSeedance },
  ],
};
