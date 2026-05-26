import { copyFile } from 'node:fs/promises';

import { AppError } from '../../errors.js';
import { downloadDouyinVideo } from '../../media/douyin.js';
import {
  concatVideos,
  extractAudio,
  normalizeVideo,
  replaceAudio,
  trimVideo,
} from '../../media/ffmpeg.js';
import type { SeedanceVideoRequest, TranscriptResult } from '../../model-client/index.js';
import type { ExplosionInput } from '../../../shared/types.js';
import {
  artifactPath,
  parseModelJson,
  readJson,
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
  transition?: string;
}

interface ScriptParse {
  cta_keywords: string[];
  scenes: StoryboardShot[];
  selling_points?: string[];
  rhythm?: string;
  original_script?: string;
}

interface Variant {
  index: number;
  copy: string;
  script: string;
  storyboard: StoryboardShot[];
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

interface FinalVideoOutput {
  index: number;
  path: string;
  audioSource: 'source_audio' | 'seedance';
}

function isReferenceVideoRejected(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /InputVideoSensitiveContentDetected|real person|reference_video|video duration|video pixel/iu.test(message);
}

const SEEDANCE_MIN_DURATION_SEC = 4;
const SEEDANCE_MAX_DURATION_SEC = 15;
const DEFAULT_SHOT_DURATION_SEC = 2;

function isEmptyTranscript(transcript: TranscriptResult): boolean {
  return transcript.text.trim().length === 0 && transcript.segments.length === 0;
}

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

function normalizeSeedanceDuration(durationSec: number): number {
  return Math.min(
    SEEDANCE_MAX_DURATION_SEC,
    Math.max(SEEDANCE_MIN_DURATION_SEC, Math.round(durationSec)),
  );
}

interface StoryboardSegment {
  index: number;
  shots: StoryboardShot[];
  durationSec: number;
}

function splitLongShot(shot: StoryboardShot, durationSec: number): StoryboardShot[] {
  if (durationSec <= SEEDANCE_MAX_DURATION_SEC) {
    return [{ ...shot, durationSec }];
  }
  const parts: StoryboardShot[] = [];
  let remaining = durationSec;
  let partIndex = 1;
  while (remaining > 0) {
    const partDuration = Math.min(SEEDANCE_MAX_DURATION_SEC, remaining);
    parts.push({
      ...shot,
      index: Number(`${shot.index}${partIndex}`),
      durationSec: partDuration,
      visualPrompt: `${shot.visualPrompt}（延续镜头 ${shot.index} 的第 ${partIndex} 段，保持动作和构图连续。）`,
    });
    remaining -= partDuration;
    partIndex += 1;
  }
  return parts;
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
      durationSec: normalizeSeedanceDuration(currentDuration),
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
        currentDuration + partDuration > SEEDANCE_MAX_DURATION_SEC
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
): string {
  const segmentPrefix =
    segmentCount > 1
      ? `当前仅生成第 ${segmentIndex}/${segmentCount} 段，需与前后段在镜头运动、主体位置、色彩和节奏上连续。\n`
      : '';
  return `${segmentPrefix}${shots
    .map(
      (shot) =>
        `镜头 ${shot.index}（${normalizeShotDuration(shot)}s）：${shot.visualPrompt}。旁白/字幕：${shot.narration ?? ''}。转场：${shot.transition ?? ''}`,
    )
    .join('\n')}`;
}

async function runDownload(ctx: StepContext<ExplosionInput>) {
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
          '你是短视频广告编导。输出 JSON 数组，每项包含 index、copy、script、storyboard。storyboard 是分镜数组，每个分镜包含 index、durationSec、visualPrompt、narration、transition。',
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
  const missingCta = variants.some((variant) =>
    scriptParse.cta_keywords.some((keyword) => {
      const combined = `${variant.copy}\n${variant.script}\n${JSON.stringify(variant.storyboard)}`;
      return !combined.includes(keyword);
    }),
  );
  if (missingCta) {
    throw new AppError('E_CTA_LOST');
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

async function runSeedance(ctx: StepContext<ExplosionInput>) {
  const variants = await readJson<Variant[]>(artifactPath(ctx.artifactDir, 'variants.json'));
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
      const resolution = '1080x1920';
      const request: SeedanceVideoRequest = {
        ...(nextReferencePath !== undefined ? { refVideoPath: nextReferencePath } : {}),
        prompt: workflowPrompt(ctx, 'explosion.seedance', {
          copy: variant.copy,
          script: variant.script,
          storyboard: buildStoryboardPrompt(segment.shots, segment.index, segments.length),
        }),
        durationSec,
        resolution,
        outputPath,
      };
      let usedReferenceVideo = nextReferencePath !== undefined;
      try {
        await ctx.modelClient.generateVideo(request);
      } catch (error) {
        if (!isReferenceVideoRejected(error)) {
          throw error;
        }
        usedReferenceVideo = false;
        await ctx.modelClient.generateVideo({
          prompt: request.prompt,
          durationSec,
          resolution,
          outputPath,
        });
      }

      generatedSegments.push({
        index: segment.index,
        path: request.outputPath,
        durationSec,
        usedReferenceVideo,
        ...(nextReferencePath !== undefined ? { referenceVideoPath: nextReferencePath } : {}),
      });
      nextReferencePath = request.outputPath;
    }

    if (generatedSegments.length > 1) {
      await concatVideos(
        generatedSegments.map((segment) => segment.path),
        finalOutputPath,
      );
    }
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

async function runAudioReplace(ctx: StepContext<ExplosionInput>) {
  const variants = await readJson<Variant[]>(artifactPath(ctx.artifactDir, 'variants.json'));
  const transcript = await readJson<TranscriptResult>(
    artifactPath(ctx.artifactDir, 'transcript.json'),
  );
  const shouldUseSeedanceAudio = isEmptyTranscript(transcript);
  const outputs: FinalVideoOutput[] = [];
  for (const variant of variants) {
    const generatedVideoPath = artifactPath(ctx.artifactDir, `variant_${variant.index}.mp4`);
    const finalPath = artifactPath(ctx.artifactDir, `final_${variant.index}.mp4`);
    if (shouldUseSeedanceAudio) {
      await copyFile(generatedVideoPath, finalPath);
    } else {
      await replaceAudio(generatedVideoPath, artifactPath(ctx.artifactDir, 'source.m4a'), finalPath);
    }
    ctx.repository.createAsset({
      taskId: ctx.task.id,
      kind: 'video',
      path: finalPath,
      tags: ['explosion'],
    });
    outputs.push({
      index: variant.index,
      path: finalPath,
      audioSource: shouldUseSeedanceAudio ? 'seedance' : 'source_audio',
    });
  }
  return {
    artifactPath: await writeJson(artifactPath(ctx.artifactDir, 'final_outputs.json'), outputs),
  };
}

export const explosionPipeline: PipelineDefinition<ExplosionInput> = {
  type: 'explosion',
  steps: [
    { name: 'download', runStep: runDownload },
    { name: 'asr', runStep: runAsr },
    { name: 'script_parse', runStep: runScriptParse },
    { name: 'rewrite', runStep: runRewrite },
    { name: 'seedance', runStep: runSeedance },
    { name: 'audio_replace', runStep: runAudioReplace },
  ],
};
