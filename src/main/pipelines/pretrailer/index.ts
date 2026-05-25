import { copyFile } from 'node:fs/promises';

import { AppError } from '../../errors.js';
import { concatWithFade, extractAudio, extractFrames, muxAudioVideo, normalizeVideo } from '../../media/ffmpeg.js';
import type { PretrailerInput } from '../../../shared/types.js';
import { artifactPath, parseModelJson, readJson, workflowPrompt, writeJson } from '../helpers.js';
import type { PipelineDefinition, StepContext } from '../types.js';

interface Understanding {
  confidence: number;
  category: string;
  sellingPoints: string[];
  visualStyle: string;
  audience: string;
}

interface PretrailerCopy {
  text: string;
  hookAtSec: number;
  voice: string;
}

interface PretrailerScript {
  shots: Array<{ index: number; durationSec: number; prompt: string }>;
}

async function runIngest(ctx: StepContext<PretrailerInput>) {
  const source = artifactPath(ctx.artifactDir, 'source.mp4');
  await normalizeVideo(ctx.input.sourceVideoPath, source);
  await extractAudio(source, artifactPath(ctx.artifactDir, 'source.m4a'));
  return { artifactPath: source };
}

async function runUnderstand(ctx: StepContext<PretrailerInput>) {
  const framesDir = artifactPath(ctx.artifactDir, 'understand_frames');
  await extractFrames(artifactPath(ctx.artifactDir, 'source.mp4'), framesDir);
  const text = await ctx.modelClient.vision(
    [artifactPath(framesDir, 'frame_0001.jpg')],
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

async function runKeyframePick(ctx: StepContext<PretrailerInput>) {
  const keyframesDir = artifactPath(ctx.artifactDir, 'keyframes');
  await extractFrames(artifactPath(ctx.artifactDir, 'source.mp4'), keyframesDir);
  return { artifactPath: keyframesDir };
}

async function runCopyGen(ctx: StepContext<PretrailerInput>) {
  const understanding = await readJson<Understanding>(artifactPath(ctx.artifactDir, 'understanding.json'));
  const response = await ctx.modelClient.chat([
    { role: 'system', content: '你是广告前贴文案专家，输出 JSON：text、hookAtSec、voice。' },
    {
      role: 'user',
      content: workflowPrompt(ctx, 'pretrailer.copy_gen', {
        pretrailerDuration: ctx.input.pretrailerDuration,
        style: ctx.input.style,
        visualStyle: understanding.visualStyle,
      }),
    },
  ]);
  const copy = parseModelJson<PretrailerCopy>(response, '广告前贴文案');
  if (!copy.text || typeof copy.hookAtSec !== 'number' || !copy.voice) {
    throw new AppError('E_MODEL_API_FAILED', '广告前贴文案缺少必要字段');
  }
  if (copy.hookAtSec > 1) {
    throw new AppError('E_INPUT_VALIDATION', '前贴钩子必须在 1 秒内出现');
  }
  return { artifactPath: await writeJson(artifactPath(ctx.artifactDir, 'copy.json'), copy) };
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

async function runSeedance(ctx: StepContext<PretrailerInput>) {
  const script = await readJson<PretrailerScript>(artifactPath(ctx.artifactDir, 'script.json'));
  await ctx.modelClient.generateVideo({
    refImagePaths: [artifactPath(ctx.artifactDir, 'keyframes/frame_0001.jpg')],
    prompt: workflowPrompt(ctx, 'pretrailer.seedance', { scriptJson: JSON.stringify(script) }),
    durationSec: ctx.input.pretrailerDuration,
    outputPath: artifactPath(ctx.artifactDir, 'pretrailer.mp4'),
  });
  return { artifactPath: artifactPath(ctx.artifactDir, 'pretrailer.mp4') };
}

async function runTts(ctx: StepContext<PretrailerInput>) {
  const copy = await readJson<PretrailerCopy>(artifactPath(ctx.artifactDir, 'copy.json'));
  const audio = await ctx.modelClient.tts(copy.text, copy.voice);
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
  await concatWithFade(artifactPath(ctx.artifactDir, 'pretrailer_av.mp4'), artifactPath(ctx.artifactDir, 'source.mp4'), finalPath);
  ctx.repository.createAsset({ taskId: ctx.task.id, kind: 'video', path: finalPath, tags: ['pretrailer'] });
  return { artifactPath: finalPath, logs: 'xfade transition=fade:duration=0.4' };
}

export const pretrailerPipeline: PipelineDefinition<PretrailerInput> = {
  type: 'pretrailer',
  steps: [
    { name: 'ingest', runStep: runIngest },
    { name: 'understand', runStep: runUnderstand },
    { name: 'keyframe_pick', runStep: runKeyframePick },
    { name: 'copy_gen', runStep: runCopyGen },
    { name: 'script_gen', runStep: runScriptGen },
    { name: 'seedance', runStep: runSeedance },
    { name: 'tts', runStep: runTts },
    { name: 'mux_pretrailer', runStep: runMuxPretrailer },
    { name: 'concat', runStep: runConcat },
  ],
};
