import { existsSync } from 'node:fs';
import { copyFile } from 'node:fs/promises';

import { AppError } from '../../errors.js';
import { concatVideos, overlayProductImages, transcodeAudioToMp3 } from '../../media/ffmpeg.js';
import type { AvatarInput } from '../../../shared/types.js';
import {
  artifactPath,
  buildReferencePolicyText,
  buildSeedancePromptCard,
  parseModelJson,
  readJson,
  waitForScriptConfirmation,
  workflowPrompt,
  writeJson,
} from '../helpers.js';
import type { PipelineDefinition, StepContext } from '../types.js';

interface AvatarValidation {
  valid: boolean;
  reason: string;
  credibility?: string;
  risks?: string[];
}

interface BrandParse {
  tone: string;
  audience: string;
  audiencePain?: string;
  oneLineBenefit?: string;
  differentiators: string[];
  proofPoints?: string[];
  forbiddenClaims?: string[];
}

interface ProductUnderstanding {
  shape: string;
  color: string;
  sellingPoints: string[];
  visibleProofPoints?: string[];
  requiredVisualElements?: string[];
  forbiddenClaims?: string[];
  visualRisks?: string[];
}

interface AvatarScript {
  text: string;
  hookType?: 'pain_question' | 'benefit' | 'contrast' | 'micro_story';
  differentiators: string[];
  ttsNotes?: string;
  avatarSceneType?: 'single_talking' | 'product_overlay' | 'picture_in_picture' | 'desk_demo';
  timeline: Array<{
    sellingPoint: string;
    atSec: number;
    productImageIndex: number;
    visualAction?: string;
  }>;
  riskControl?: string;
}

interface AvatarAudioSegment {
  index: number;
  text: string;
  durationSec: number;
  audioPath: string;
}

interface AvatarVideoSegment {
  index: number;
  durationSec: number;
  audioPath: string;
  videoPath: string;
  text: string;
  lipSyncOffsetMs?: number;
}

interface AvatarVideoPrompts {
  basePrompt: string;
}

const DIGITAL_HUMAN_MIN_DURATION_SEC = 4;
const DIGITAL_HUMAN_MAX_DURATION_SEC = 15;

function splitDurationForDigitalHuman(durationSec: number): number[] {
  const normalizedDuration = Math.max(DIGITAL_HUMAN_MIN_DURATION_SEC, Math.round(durationSec));
  const chunks: number[] = [];
  let remaining = normalizedDuration;
  while (remaining > DIGITAL_HUMAN_MAX_DURATION_SEC) {
    const remainingAfterMax = remaining - DIGITAL_HUMAN_MAX_DURATION_SEC;
    const current =
      remainingAfterMax > 0 && remainingAfterMax < DIGITAL_HUMAN_MIN_DURATION_SEC
        ? DIGITAL_HUMAN_MAX_DURATION_SEC - (DIGITAL_HUMAN_MIN_DURATION_SEC - remainingAfterMax)
        : DIGITAL_HUMAN_MAX_DURATION_SEC;
    chunks.push(current);
    remaining -= current;
  }
  if (remaining > 0) {
    chunks.push(remaining);
  }
  return chunks;
}

function splitTextIntoSentences(text: string): string[] {
  const normalized = text.replace(/\s+/gu, ' ').trim();
  if (normalized.length === 0) {
    return [];
  }
  const matches = normalized.match(/[^。！？!?；;，,]+[。！？!?；;，,]?/gu);
  return (matches ?? [normalized]).map((item) => item.trim()).filter((item) => item.length > 0);
}

function splitTextByCharacterCount(text: string, count: number): string[] {
  const characters = Array.from(text.trim());
  const chunkSize = Math.ceil(characters.length / count);
  const chunks: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const chunk = characters.slice(index * chunkSize, (index + 1) * chunkSize).join('').trim();
    if (chunk.length > 0) {
      chunks.push(chunk);
    }
  }
  return chunks;
}

function splitScriptTextForSegments(text: string, segmentCount: number): string[] {
  if (segmentCount <= 1) {
    return [text.trim()];
  }
  const sentences = splitTextIntoSentences(text);
  if (sentences.length <= segmentCount) {
    const characterChunks = splitTextByCharacterCount(text, segmentCount);
    return characterChunks.length === segmentCount ? characterChunks : sentences;
  }

  const totalLength = sentences.reduce((total, sentence) => total + sentence.length, 0);
  const targetLength = Math.max(1, Math.ceil(totalLength / segmentCount));
  const chunks: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    const shouldFlush =
      chunks.length < segmentCount - 1 &&
      current.length > 0 &&
      current.length + sentence.length > targetLength;
    if (shouldFlush) {
      chunks.push(current.trim());
      current = '';
    }
    current = `${current}${sentence}`;
  }
  if (current.trim().length > 0) {
    chunks.push(current.trim());
  }

  while (chunks.length < segmentCount) {
    if (chunks.length === 0) {
      break;
    }
    const longestIndex = chunks.reduce(
      (selected, chunk, index) => {
        const selectedChunk = chunks[selected];
        return selectedChunk !== undefined && chunk.length > selectedChunk.length ? index : selected;
      },
      0,
    );
    const [longest] = chunks.splice(longestIndex, 1);
    if (longest === undefined) {
      break;
    }
    const split = splitTextByCharacterCount(longest, 2);
    chunks.splice(longestIndex, 0, ...split);
  }

  return chunks.slice(0, segmentCount);
}

async function runValidateAvatar(ctx: StepContext<AvatarInput>) {
  const avatarReferencePath = artifactPath(ctx.artifactDir, 'avatar_reference.png');
  const response = await ctx.modelClient.vision(
    [ctx.input.avatarImagePath],
    workflowPrompt(ctx, 'avatar.validate_avatar'),
  );
  const validation = parseModelJson<AvatarValidation>(response, '数字人图片校验');
  if (!validation.valid) {
    throw new AppError('E_AVATAR_INVALID', validation.reason);
  }
  await writeJson(artifactPath(ctx.artifactDir, 'validate.json'), validation);
  const generated = await ctx.modelClient.generateImage({
    refImagePath: ctx.input.avatarImagePath,
    prompt: workflowPrompt(ctx, 'avatar.image_generation'),
    outputPath: avatarReferencePath,
    size: '2K',
  });
  return { artifactPath: generated.localPath };
}

async function runProductUnderstand(ctx: StepContext<AvatarInput>) {
  const response = await ctx.modelClient.vision(
    ctx.input.productImagePaths,
    workflowPrompt(ctx, 'avatar.product_understand'),
  );
  const product = parseModelJson<ProductUnderstanding>(response, '产品图理解');
  if (!product.shape || !product.color || !Array.isArray(product.sellingPoints)) {
    throw new AppError('E_MODEL_API_FAILED', '产品图理解缺少必要字段');
  }
  return { artifactPath: await writeJson(artifactPath(ctx.artifactDir, 'product.json'), product) };
}

async function runBrandParse(ctx: StepContext<AvatarInput>) {
  const response = await ctx.modelClient.chat([
    {
      role: 'system',
      content: '你是品牌策略解析助手。先内部分析人群、痛点、证据和禁用承诺，不输出推理链；只输出合法 JSON。',
    },
    {
      role: 'user',
      content: workflowPrompt(ctx, 'avatar.brand_parse', { brandIntro: ctx.input.brandIntro }),
    },
  ]);
  const brand = parseModelJson<BrandParse>(response, '品牌解析');
  if (!brand.tone || !brand.audience || !Array.isArray(brand.differentiators)) {
    throw new AppError('E_MODEL_API_FAILED', '品牌解析缺少必要字段');
  }
  return { artifactPath: await writeJson(artifactPath(ctx.artifactDir, 'brand.json'), brand) };
}

async function runScriptGen(ctx: StepContext<AvatarInput>) {
  const brand = await readJson<BrandParse>(artifactPath(ctx.artifactDir, 'brand.json'));
  const product = await readJson<ProductUnderstanding>(
    artifactPath(ctx.artifactDir, 'product.json'),
  );
  const response = await ctx.modelClient.chat([
    {
      role: 'system',
      content:
        '你是转化型数字人口播编导。先内部比较痛点设问、福利利益、对比反差和轻剧情方向，不输出推理链；只输出 JSON：{"text":"...","hookType":"pain_question|benefit|contrast|micro_story","differentiators":["...","..."],"ttsNotes":"...","avatarSceneType":"single_talking|product_overlay|picture_in_picture|desk_demo","timeline":[{"sellingPoint":"...","atSec":4,"productImageIndex":0,"visualAction":"..."}],"riskControl":"..."}。',
    },
    {
      role: 'user',
      content: workflowPrompt(ctx, 'avatar.script_gen', {
        duration: ctx.input.duration,
        brandJson: JSON.stringify(brand),
        productJson: JSON.stringify(product),
        productImageCount: ctx.input.productImagePaths.length,
      }),
    },
  ]);
  const script = parseModelJson<AvatarScript>(response, '数字人口播脚本');
  if (!script.text || !Array.isArray(script.differentiators) || script.differentiators.length < 2) {
    throw new AppError('E_INPUT_VALIDATION', '口播文案至少需要 2 个产品差异化卖点');
  }
  if (!Array.isArray(script.timeline)) {
    throw new AppError('E_MODEL_API_FAILED', '数字人口播脚本缺少时间轴');
  }
  return { artifactPath: await writeJson(artifactPath(ctx.artifactDir, 'script.json'), script) };
}

async function runScriptConfirm(ctx: StepContext<AvatarInput>) {
  return waitForScriptConfirmation(ctx, 'script.json', '数字人口播脚本文案');
}

async function runTts(ctx: StepContext<AvatarInput>) {
  const script = await readJson<AvatarScript>(artifactPath(ctx.artifactDir, 'script.json'));
  const durations = splitDurationForDigitalHuman(ctx.input.duration);
  const texts = splitScriptTextForSegments(script.text, durations.length);
  if (durations.length === 1) {
    const audio = await ctx.modelClient.tts(texts[0] ?? script.text);
    await copyFile(audio.localPath, artifactPath(ctx.artifactDir, 'voice.mp3'));
    return { artifactPath: artifactPath(ctx.artifactDir, 'voice.mp3') };
  }

  const segments: AvatarAudioSegment[] = [];
  for (const [index, durationSec] of durations.entries()) {
    const text = texts[index] ?? texts[texts.length - 1] ?? script.text;
    const audio = await ctx.modelClient.tts(text);
    const audioPath = artifactPath(ctx.artifactDir, `voice_part_${index + 1}.mp3`);
    await copyFile(audio.localPath, audioPath);
    segments.push({
      index: index + 1,
      text,
      durationSec,
      audioPath,
    });
  }
  return {
    artifactPath: await writeJson(artifactPath(ctx.artifactDir, 'voice_segments.json'), segments),
    logs: `已按数字人单次生成上限切分为 ${segments.length} 段`,
  };
}

async function ensureDigitalHumanAudio(ctx: StepContext<AvatarInput>): Promise<AvatarAudioSegment[]> {
  const segmentPath = artifactPath(ctx.artifactDir, 'voice_segments.json');
  if (existsSync(segmentPath)) {
    return readJson<AvatarAudioSegment[]>(segmentPath);
  }

  const supportedAudioPath = artifactPath(ctx.artifactDir, 'voice.mp3');
  if (existsSync(supportedAudioPath)) {
    return [
      {
        index: 1,
        text: '',
        durationSec: Math.min(ctx.input.duration, DIGITAL_HUMAN_MAX_DURATION_SEC),
        audioPath: supportedAudioPath,
      },
    ];
  }

  const legacyAudioPath = artifactPath(ctx.artifactDir, 'voice.m4a');
  if (existsSync(legacyAudioPath)) {
    return [
      {
        index: 1,
        text: '',
        durationSec: Math.min(ctx.input.duration, DIGITAL_HUMAN_MAX_DURATION_SEC),
        audioPath: await transcodeAudioToMp3(legacyAudioPath, supportedAudioPath),
      },
    ];
  }

  return [
    {
      index: 1,
      text: '',
      durationSec: Math.min(ctx.input.duration, DIGITAL_HUMAN_MAX_DURATION_SEC),
      audioPath: supportedAudioPath,
    },
  ];
}

async function buildAvatarBasePrompt(ctx: StepContext<AvatarInput>): Promise<string> {
  const scriptPath = artifactPath(ctx.artifactDir, 'script.json');
  const script = existsSync(scriptPath) ? await readJson<AvatarScript>(scriptPath) : undefined;
  const referencePolicy = buildReferencePolicyText({
    hasAvatarImage: true,
    hasProductImages: ctx.input.productImagePaths.length > 0,
    purpose: '数字人口播广告生成：音频驱动唇形，人物可信出镜，产品露出服务转化。',
  });
  return `${workflowPrompt(ctx, 'avatar.seedance_avatar')}\n${buildSeedancePromptCard({
    outputGoal: '转化型数字人口播广告',
    durationSec: Math.min(ctx.input.duration, DIGITAL_HUMAN_MAX_DURATION_SEC),
    visualAnchor: `参考数字人形象；产品图数量 ${ctx.input.productImagePaths.length}`,
    behaviorState: script?.avatarSceneType ?? 'single_talking',
    localTone: '可信、自然、清晰、轻微手势，眼神稳定看向镜头',
    videoTheme: script?.hookType ?? '数字人口播转化广告',
    referencePolicy,
    sourceText: script?.text,
    preservedConstraints: ['参考音频', '唇形同步', '人物身份一致', '产品露出时间轴'],
    forbidden: ['不要改变人物身份', '不要夸大产品效果', '不要生成水印、字幕或不可控文字'],
    repairHint: '若唇形或人物不稳定，降低动作幅度并强调正面半身；若产品露出弱，改为画中画或产品贴片。',
  })}`;
}

async function runVideoPromptOptimize(ctx: StepContext<AvatarInput>) {
  return {
    artifactPath: await writeJson(artifactPath(ctx.artifactDir, 'video_prompts.json'), {
      basePrompt: await buildAvatarBasePrompt(ctx),
    }),
  };
}

async function runSeedanceAvatar(ctx: StepContext<AvatarInput>) {
  const audioSegments = await ensureDigitalHumanAudio(ctx);
  const videoPromptsPath = artifactPath(ctx.artifactDir, 'video_prompts.json');
  const videoPrompts = existsSync(videoPromptsPath)
    ? await readJson<AvatarVideoPrompts>(videoPromptsPath)
    : undefined;
  const basePrompt = videoPrompts?.basePrompt ?? (await buildAvatarBasePrompt(ctx));
  const videoSegments: AvatarVideoSegment[] = [];
  for (const segment of audioSegments) {
    const outputPath =
      audioSegments.length === 1
        ? artifactPath(ctx.artifactDir, 'avatar.mp4')
        : artifactPath(ctx.artifactDir, `avatar_part_${segment.index}.mp4`);
    const segmentPrompt =
      audioSegments.length === 1
        ? basePrompt
        : `${basePrompt}\n当前生成第 ${segment.index}/${audioSegments.length} 段，时长 ${segment.durationSec}s。请保持人物身份、机位、光线、表情节奏与前后段连续。本段口播：${segment.text}`;
    const result = await ctx.modelClient.generateDigitalHuman({
      audioPath: segment.audioPath,
      avatarImagePath: artifactPath(ctx.artifactDir, 'avatar_reference.png'),
      prompt: segmentPrompt,
      durationSec: segment.durationSec,
      outputPath,
    });
    videoSegments.push({
      index: segment.index,
      durationSec: segment.durationSec,
      audioPath: segment.audioPath,
      videoPath: result.localPath,
      text: segment.text,
      ...(result.lipSyncOffsetMs !== undefined ? { lipSyncOffsetMs: result.lipSyncOffsetMs } : {}),
    });
  }

  if (videoSegments.length > 1) {
    await concatVideos(
      videoSegments.map((segment) => segment.videoPath),
      artifactPath(ctx.artifactDir, 'avatar.mp4'),
    );
    await writeJson(artifactPath(ctx.artifactDir, 'avatar_segments.json'), videoSegments);
  }

  const lipSyncOffsets = videoSegments
    .map((segment) => segment.lipSyncOffsetMs)
    .filter((offset): offset is number => offset !== undefined);
  const maxLipSyncOffset = lipSyncOffsets.length > 0 ? Math.max(...lipSyncOffsets) : undefined;
  if (maxLipSyncOffset !== undefined && maxLipSyncOffset > 80) {
    return {
      artifactPath: artifactPath(ctx.artifactDir, 'avatar.mp4'),
      logs: `已生成 ${videoSegments.length} 段并拼接；最大唇形同步偏差 ${maxLipSyncOffset}ms，已记录告警`,
    };
  }
  return {
    artifactPath: artifactPath(ctx.artifactDir, 'avatar.mp4'),
    logs:
      videoSegments.length > 1
        ? `已生成 ${videoSegments.length} 段并拼接，单段时长 ${videoSegments
            .map((segment) => `${segment.durationSec}s`)
            .join(' + ')}`
        : undefined,
  };
}

async function runOverlay(ctx: StepContext<AvatarInput>) {
  const finalPath = artifactPath(ctx.artifactDir, 'final.mp4');
  await overlayProductImages(
    artifactPath(ctx.artifactDir, 'avatar.mp4'),
    ctx.input.productImagePaths,
    finalPath,
  );
  return { artifactPath: finalPath };
}

async function runPostprocess(ctx: StepContext<AvatarInput>) {
  const finalPath = artifactPath(ctx.artifactDir, 'final.mp4');
  ctx.repository.createAsset({
    taskId: ctx.task.id,
    kind: 'video',
    path: finalPath,
    tags: ['avatar'],
  });
  return { artifactPath: finalPath };
}

export const avatarPipeline: PipelineDefinition<AvatarInput> = {
  type: 'avatar',
  steps: [
    { name: 'validate_avatar', runStep: runValidateAvatar },
    { name: 'product_understand', runStep: runProductUnderstand },
    { name: 'brand_parse', runStep: runBrandParse },
    { name: 'script_gen', runStep: runScriptGen },
    { name: 'script_confirm', runStep: runScriptConfirm },
    { name: 'tts', runStep: runTts },
    { name: 'video_prompt_optimize', runStep: runVideoPromptOptimize },
    { name: 'seedance_avatar', runStep: runSeedanceAvatar },
    { name: 'overlay', runStep: runOverlay },
    { name: 'postprocess', runStep: runPostprocess },
  ],
};
