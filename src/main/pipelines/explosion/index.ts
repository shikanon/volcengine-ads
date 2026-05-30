import { existsSync } from 'node:fs';
import { copyFile } from 'node:fs/promises';

import { AppError } from '../../errors.js';
import { downloadDouyinVideo } from '../../media/douyin.js';
import {
  concatAudioSegments,
  concatSilentVideos,
  concatVideos,
  extractAudio,
  normalizeVideo,
  replaceAudio,
  trimAudio,
  trimVideo,
} from '../../media/ffmpeg.js';
import type { SeedanceVideoRequest, TranscriptResult } from '../../model-client/index.js';
import {
  DEFAULT_VIDEO_RESOLUTION,
  type ExplosionInput,
  type TtsSpeaker,
} from '../../../shared/types.js';
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
  audioPath?: string;
  voiceoverText?: string;
  voiceGender?: ExplosionVoiceGender;
  voiceSpeaker?: TtsSpeaker;
}

interface FinalVideoOutput {
  index: number;
  path: string;
  audioSource: 'source_audio' | 'seedance' | 'tts_seedance';
}

interface ExplosionVideoPromptSegment {
  index: number;
  durationSec: number;
  prompt: string;
  noReferencePrompt: string;
  voiceoverText?: string;
  voiceGender?: ExplosionVoiceGender;
  voiceSpeaker?: TtsSpeaker;
  audioPath?: string;
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
const EXPLOSION_TTS_SPEAKERS: Record<ExplosionVoiceGender, TtsSpeaker> = {
  female: 'zh_female_vv_uranus_bigtts',
  male: 'zh_male_m191_uranus_bigtts',
};

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

function spokenTextForShot(shot: StoryboardShot): string {
  return (
    shot.voiceoverText ??
    shot.voiceover ??
    shot.dialogue ??
    shot.spokenText ??
    shot.narration ??
    ''
  ).trim();
}

function buildSegmentVoiceoverText(shots: StoryboardShot[]): string | undefined {
  const text = shots
    .map((shot) => spokenTextForShot(shot))
    .filter((item) => item.length > 0)
    .join(' ')
    .replace(/\s+/gu, ' ')
    .trim();
  return text.length > 0 ? text : undefined;
}

function normalizeVoiceGender(value: unknown): ExplosionVoiceGender | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (/^(male|man|男|男声|男性|男生)$/u.test(normalized)) {
    return 'male';
  }
  if (/^(female|woman|女|女声|女性|女生)$/u.test(normalized)) {
    return 'female';
  }
  return undefined;
}

function inferVoiceGender(shots: StoryboardShot[]): ExplosionVoiceGender {
  for (const shot of shots) {
    const explicit = normalizeVoiceGender(shot.voiceGender ?? shot.speakerGender ?? shot.speaker);
    if (explicit !== undefined) {
      return explicit;
    }
  }
  const voiceText = shots
    .map((shot) => `${spokenTextForShot(shot)} ${shot.visualPrompt}`)
    .join(' ');
  if (/男声|男生|男性|爸爸|父亲|哥哥|叔叔|爷爷|老公|先生|兄弟/u.test(voiceText)) {
    return 'male';
  }
  if (/女声|女生|女性|妈妈|母亲|姐姐|阿姨|奶奶|老婆|女士|姐妹/u.test(voiceText)) {
    return 'female';
  }
  return 'female';
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

async function runScriptConfirm(ctx: StepContext<ExplosionInput>) {
  return waitForScriptConfirmation(ctx, 'variants.md', '爆款裂变脚本文案');
}

async function synthesizeSegmentVoiceover(
  ctx: StepContext<ExplosionInput>,
  variantIndex: number,
  segment: StoryboardSegment,
): Promise<
  Pick<ExplosionVideoPromptSegment, 'audioPath' | 'voiceGender' | 'voiceSpeaker' | 'voiceoverText'>
> {
  const voiceoverText = buildSegmentVoiceoverText(segment.shots);
  if (voiceoverText === undefined) {
    return {};
  }
  if (voiceoverText.length > 1000) {
    throw new AppError('E_INPUT_VALIDATION', '爆款裂变分镜口播文本不能超过 1000 字符');
  }
  const voiceGender = inferVoiceGender(segment.shots);
  const voiceSpeaker = EXPLOSION_TTS_SPEAKERS[voiceGender];
  const rawAudio = await ctx.modelClient.tts(voiceoverText, voiceSpeaker);
  const audioPath = artifactPath(
    ctx.artifactDir,
    `variant_${variantIndex}_segment_${segment.index}_voice.mp3`,
  );
  await trimAudio(rawAudio.localPath, audioPath, segment.durationSec);
  await ctx.appendLog?.('info', '爆款裂变分镜口播音频生成成功', {
    variantIndex,
    segmentIndex: segment.index,
    durationSec: segment.durationSec,
    voiceGender,
    voiceSpeaker,
    audioPath,
    textLength: voiceoverText.length,
  });
  return { audioPath, voiceGender, voiceSpeaker, voiceoverText };
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
      const voiceover = await synthesizeSegmentVoiceover(ctx, variant.index, segment);
      const audioInstruction =
        voiceover.audioPath !== undefined
          ? '\n本分段会随请求提供 reference_audio 口播/对白音频；视频动作、口型、节奏和情绪必须贴合该音频，不要生成与音频冲突的字幕或额外口播。'
          : '';
      const noReferenceAudioInstruction =
        voiceover.audioPath !== undefined
          ? '\n当前无参考素材 fallback 不会传入 reference_audio；请仅按脚本和分镜生成画面，不要声称参考了音频。'
          : '';
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
          referencePolicy: `${referencePolicy}${audioInstruction}`,
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
          referencePolicy: `${noReferencePolicy}${noReferenceAudioInstruction}`,
        }),
        ...voiceover,
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
      const requestAudioPath =
        optimizedSegment?.audioPath !== undefined && nextReferencePath !== undefined
          ? optimizedSegment.audioPath
          : undefined;
      const request: SeedanceVideoRequest = {
        ...(nextReferencePath !== undefined ? { refVideoPath: nextReferencePath } : {}),
        ...(requestAudioPath !== undefined ? { audioPath: requestAudioPath } : {}),
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
      let usedAudioPath: string | undefined = requestAudioPath;
      try {
        await ctx.modelClient.generateVideo(request);
      } catch (error) {
        if (!isReferenceVideoRejected(error)) {
          throw error;
        }
        usedReferenceVideo = false;
        usedReferenceVideoPath = undefined;
        usedAudioPath = undefined;
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
        ...(usedAudioPath !== undefined ? { audioPath: usedAudioPath } : {}),
        ...(optimizedSegment?.voiceoverText !== undefined
          ? { voiceoverText: optimizedSegment.voiceoverText }
          : {}),
        ...(optimizedSegment?.voiceGender !== undefined ? { voiceGender: optimizedSegment.voiceGender } : {}),
        ...(optimizedSegment?.voiceSpeaker !== undefined
          ? { voiceSpeaker: optimizedSegment.voiceSpeaker }
          : {}),
      });
      nextReferencePath = request.outputPath;
    }

    if (generatedSegments.length > 1) {
      const hasVoiceoverAudio = generatedSegments.some((segment) => segment.audioPath !== undefined);
      await (hasVoiceoverAudio ? concatVideos : concatSilentVideos)(
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
  const videoPromptsPath = artifactPath(ctx.artifactDir, 'video_prompts.json');
  const videoPrompts = existsSync(videoPromptsPath)
    ? await readJson<ExplosionVideoPrompts>(videoPromptsPath)
    : undefined;
  const seedanceOutputsPath = artifactPath(ctx.artifactDir, 'seedance_outputs.json');
  const seedanceOutputs = existsSync(seedanceOutputsPath)
    ? await readJson<GeneratedVideoOutput[]>(seedanceOutputsPath)
    : [];
  const shouldUseSeedanceAudioByDefault = isEmptyTranscript(transcript);
  const outputs: FinalVideoOutput[] = [];
  for (const variant of variants) {
    const generatedVideoPath = artifactPath(ctx.artifactDir, `variant_${variant.index}.mp4`);
    const finalPath = artifactPath(ctx.artifactDir, `final_${variant.index}.mp4`);
    const seedanceOutput = seedanceOutputs.find((output) => output.index === variant.index);
    const promptSegments =
      videoPrompts?.variants.find((output) => output.index === variant.index)?.segments ?? [];
    const allSegmentsUsedSeedanceTtsAudio =
      seedanceOutput?.segments.length !== undefined &&
      seedanceOutput.segments.length > 0 &&
      seedanceOutput.segments.every((segment) => segment.audioPath !== undefined);
    const hasPromptTtsAudio = promptSegments.some((segment) => segment.audioPath !== undefined);
    if (allSegmentsUsedSeedanceTtsAudio) {
      await copyFile(generatedVideoPath, finalPath);
    } else if (hasPromptTtsAudio) {
      const ttsTrackPath = artifactPath(ctx.artifactDir, `variant_${variant.index}_tts_track.m4a`);
      await concatAudioSegments(
        promptSegments.map((segment) => ({
          ...(segment.audioPath !== undefined ? { audioPath: segment.audioPath } : {}),
          durationSec: segment.durationSec,
        })),
        ttsTrackPath,
      );
      await replaceAudio(generatedVideoPath, ttsTrackPath, finalPath);
    } else if (shouldUseSeedanceAudioByDefault) {
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
      audioSource: allSegmentsUsedSeedanceTtsAudio || hasPromptTtsAudio
        ? 'tts_seedance'
        : shouldUseSeedanceAudioByDefault
          ? 'seedance'
          : 'source_audio',
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
    { name: 'script_confirm', runStep: runScriptConfirm },
    { name: 'video_prompt_optimize', runStep: runVideoPromptOptimize },
    { name: 'seedance', runStep: runSeedance },
    { name: 'audio_replace', runStep: runAudioReplace },
  ],
};
