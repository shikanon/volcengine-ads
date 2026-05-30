import { copyFile } from 'node:fs/promises';

import { AppError } from '../../errors.js';
import { concatWithFade, extractAudio, muxAudioVideo, normalizeVideo } from '../../media/ffmpeg.js';
import {
  getPretrailerVideoTypePrompt,
  normalizePretrailerStyle,
  type PretrailerInput,
} from '../../../shared/types.js';
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

interface Understanding {
  confidence: number;
  category: string;
  productOrStoryAnchor?: string;
  sellingPoints: string[];
  hookFormula?: string;
  proofPoints?: string[];
  visualStyle: string;
  audience: string;
  audiencePain?: string;
  openingContext?: string;
  transitionNeeds?: string;
  endingFrameContext?: string;
  riskNotes?: string[];
}

interface PretrailerCopyCandidate {
  hookType: 'conflict' | 'contrast' | 'pain' | 'spectacle' | 'spoken_question';
  text: string;
  hookAtSec: number;
  firstSecondVisual: string;
  reason?: string;
  riskNote?: string;
}

interface PretrailerCopy {
  text: string;
  hookAtSec: number;
  voice?: string;
  hookVisual?: string;
  riskNote?: string;
  selectedIndex?: number;
  candidates?: PretrailerCopyCandidate[];
}

interface PretrailerScript {
  firstSecondVisual?: string;
  transitionPlan?: string;
  endingFramePrompt?: string;
  shots: Array<{
    index: number;
    durationSec: number;
    prompt: string;
    visualAnchor?: string;
    behaviorState?: string;
    localTone?: string;
    videoTheme?: string;
  }>;
}

function normalizePretrailerCopy(copy: PretrailerCopy): PretrailerCopy {
  if (copy.text && typeof copy.hookAtSec === 'number') {
    return copy;
  }
  const selectedIndex = Math.max(1, copy.selectedIndex ?? 1);
  const selected = copy.candidates?.[selectedIndex - 1] ?? copy.candidates?.[0];
  if (selected === undefined) {
    return copy;
  }
  return {
    ...copy,
    text: selected.text,
    hookAtSec: selected.hookAtSec,
    hookVisual: selected.firstSecondVisual,
    ...(selected.riskNote !== undefined ? { riskNote: selected.riskNote } : {}),
    selectedIndex,
  };
}

function buildPretrailerSeedancePrompt(script: PretrailerScript, referencePolicy: string): string {
  const sourceText = script.shots
    .map((shot) => `镜头 ${shot.index}（${shot.durationSec}s）：${shot.prompt}`)
    .join('\n');
  return buildSeedancePromptCard({
    outputGoal: '广告前贴，首秒强钩子并自然接入原广告',
    visualAnchor: script.shots.map((shot) => shot.visualAnchor ?? shot.prompt).join('；'),
    behaviorState: script.shots.map((shot) => shot.behaviorState ?? shot.prompt).join('；'),
    localTone: script.shots.map((shot) => shot.localTone ?? '节奏紧凑，视觉冲击服务停留').join('；'),
    videoTheme: script.shots.map((shot) => shot.videoTheme ?? '广告前贴钩子').join('；'),
    referencePolicy,
    sourceText,
    preservedConstraints: ['前贴时长', '0-1 秒首秒钩子', '末帧衔接原片', '产品或故事锚点'],
    repairHint: '若首秒弱，把最强冲突、反差或奇观动作提前；若衔接割裂，重写末帧为原片开头的场景、色调或主体动作。',
    segmentNote: script.transitionPlan,
  });
}

async function runIngest(ctx: StepContext<PretrailerInput>) {
  const source = artifactPath(ctx.artifactDir, 'source.mp4');
  await normalizeVideo(ctx.input.sourceVideoPath, source);
  await extractAudio(source, artifactPath(ctx.artifactDir, 'source.m4a'));
  return { artifactPath: source };
}

async function runUnderstand(ctx: StepContext<PretrailerInput>) {
  const text = await ctx.modelClient.visionVideo(
    artifactPath(ctx.artifactDir, 'source.mp4'),
    workflowPrompt(ctx, 'pretrailer.understand'),
  );
  const understanding = parseModelJson<Understanding>(text, '广告前贴理解');
  if (
    typeof understanding.confidence !== 'number' ||
    !Array.isArray(understanding.sellingPoints) ||
    !understanding.visualStyle
  ) {
    throw new AppError('E_MODEL_API_FAILED', '广告前贴理解缺少必要字段');
  }
  if (understanding.confidence < 0.6) {
    throw new AppError('E_LOW_CONFIDENCE');
  }
  return { artifactPath: await writeJson(artifactPath(ctx.artifactDir, 'understanding.json'), understanding) };
}

async function runCopyGen(ctx: StepContext<PretrailerInput>) {
  const understanding = await readJson<Understanding>(artifactPath(ctx.artifactDir, 'understanding.json'));
  const response = await ctx.modelClient.chat([
    { role: 'system', content: '你是广告前贴文案专家，只输出 JSON：text、hookAtSec。' },
    {
      role: 'user',
      content: workflowPrompt(ctx, 'pretrailer.copy_gen', {
        pretrailerDuration: ctx.input.pretrailerDuration,
        style: getPretrailerVideoTypePrompt(ctx.input.style),
        videoType: normalizePretrailerStyle(ctx.input.style),
        visualStyle: understanding.visualStyle,
      }),
    },
  ]);
  const copy = parseModelJson<PretrailerCopy>(response, '广告前贴文案');
  const normalizedCopy = normalizePretrailerCopy(copy);
  if (!normalizedCopy.text || typeof normalizedCopy.hookAtSec !== 'number') {
    throw new AppError('E_MODEL_API_FAILED', '广告前贴文案缺少必要字段');
  }
  if (normalizedCopy.hookAtSec > 1) {
    throw new AppError('E_INPUT_VALIDATION', '前贴钩子必须在 1 秒内出现');
  }
  return { artifactPath: await writeJson(artifactPath(ctx.artifactDir, 'copy.json'), normalizedCopy) };
}

async function runScriptGen(ctx: StepContext<PretrailerInput>) {
  const understanding = await readJson<Understanding>(artifactPath(ctx.artifactDir, 'understanding.json'));
  const copy = await readJson<PretrailerCopy>(artifactPath(ctx.artifactDir, 'copy.json'));
  const response = await ctx.modelClient.chat([
    { role: 'system', content: '你是短视频广告分镜师。只输出 JSON：{"shots":[{"index":1,"durationSec":1,"prompt":"..."}]}。' },
    {
      role: 'user',
      content: workflowPrompt(ctx, 'pretrailer.script_gen', {
        pretrailerDuration: ctx.input.pretrailerDuration,
        copyText: copy.text,
        understandingJson: JSON.stringify(understanding),
      }),
    },
  ]);
  const script = parseModelJson<PretrailerScript>(response, '广告前贴分镜');
  if (!Array.isArray(script.shots) || script.shots.length === 0) {
    throw new AppError('E_MODEL_API_FAILED', '广告前贴分镜为空');
  }
  if (script.shots[0]?.durationSec !== undefined && script.shots[0].durationSec > 1) {
    throw new AppError('E_INPUT_VALIDATION', '首镜头必须小于等于 1 秒');
  }
  return { artifactPath: await writeJson(artifactPath(ctx.artifactDir, 'script.json'), script) };
}

async function runScriptConfirm(ctx: StepContext<PretrailerInput>) {
  return waitForScriptConfirmation(ctx, 'script.json', '广告前贴脚本文案');
}

async function runSeedance(ctx: StepContext<PretrailerInput>) {
  const script = await readJson<PretrailerScript>(artifactPath(ctx.artifactDir, 'script.json'));
  const referencePolicy = buildReferencePolicyText({
    purpose: '广告前贴生成：根据原片理解生成开场钩子，末帧自然承接原广告。',
    noReferenceFallback: '当前 Seedance 生成不输入原片作为参考视频，只基于前贴分镜和原片理解生成；不要声称参考了关键帧或参考视频。',
  });
  await ctx.modelClient.generateVideo({
    prompt: workflowPrompt(ctx, 'pretrailer.seedance', {
      scriptJson: buildPretrailerSeedancePrompt(script, referencePolicy),
      referencePolicy,
    }),
    durationSec: ctx.input.pretrailerDuration,
    ratio: '9:16',
    outputPath: artifactPath(ctx.artifactDir, 'pretrailer.mp4'),
  });
  return { artifactPath: artifactPath(ctx.artifactDir, 'pretrailer.mp4') };
}

async function runTts(ctx: StepContext<PretrailerInput>) {
  const copy = await readJson<PretrailerCopy>(artifactPath(ctx.artifactDir, 'copy.json'));
  const audio = await ctx.modelClient.tts(copy.text);
  await copyFile(audio.localPath, artifactPath(ctx.artifactDir, 'pretrailer.m4a'));
  return { artifactPath: artifactPath(ctx.artifactDir, 'pretrailer.m4a') };
}

async function runMuxPretrailer(ctx: StepContext<PretrailerInput>) {
  await muxAudioVideo(
    artifactPath(ctx.artifactDir, 'pretrailer.mp4'),
    artifactPath(ctx.artifactDir, 'pretrailer.m4a'),
    artifactPath(ctx.artifactDir, 'pretrailer_av.mp4'),
  );
  return { artifactPath: artifactPath(ctx.artifactDir, 'pretrailer_av.mp4') };
}

async function runConcat(ctx: StepContext<PretrailerInput>) {
  const finalPath = artifactPath(ctx.artifactDir, 'final.mp4');
  await concatWithFade(
    artifactPath(ctx.artifactDir, 'pretrailer_av.mp4'),
    artifactPath(ctx.artifactDir, 'source.mp4'),
    finalPath,
    { firstDurationSec: ctx.input.pretrailerDuration },
  );
  ctx.repository.createAsset({ taskId: ctx.task.id, kind: 'video', path: finalPath, tags: ['pretrailer'] });
  return { artifactPath: finalPath, logs: 'xfade transition=fade:duration=0.4' };
}

export const pretrailerPipeline: PipelineDefinition<PretrailerInput> = {
  type: 'pretrailer',
  steps: [
    { name: 'ingest', runStep: runIngest },
    { name: 'understand', runStep: runUnderstand },
    { name: 'copy_gen', runStep: runCopyGen },
    { name: 'script_gen', runStep: runScriptGen },
    { name: 'script_confirm', runStep: runScriptConfirm },
    { name: 'seedance', runStep: runSeedance },
    { name: 'tts', runStep: runTts },
    { name: 'mux_pretrailer', runStep: runMuxPretrailer },
    { name: 'concat', runStep: runConcat },
  ],
};
