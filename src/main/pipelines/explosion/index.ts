import { copyFile, mkdir, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { AppError } from '../../errors.js';
import { downloadDouyinVideo } from '../../media/douyin.js';
import { extractFrames, replaceAudio } from '../../media/ffmpeg.js';
import type { TranscriptResult } from '../../model-client/index.js';
import type { ExplosionInput } from '../../../shared/types.js';
import { artifactPath, readJson, writeJson, writeText } from '../helpers.js';
import type { PipelineDefinition, StepContext } from '../types.js';

interface ScriptParse {
  cta_keywords: string[];
  scenes: Array<{ index: number; summary: string; durationSec?: number }>;
}

interface Variant {
  index: number;
  copy: string;
  script: string;
}

async function listJpgs(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir))
      .filter((item) => item.endsWith('.jpg'))
      .map((item) => join(dir, item));
  } catch {
    return [];
  }
}

async function runDownload(ctx: StepContext<ExplosionInput>) {
  const result = await downloadDouyinVideo(ctx.input.douyinUrl, ctx.artifactDir);
  await writeJson(result.metaPath, {
    source: ctx.input.douyinUrl,
    warnings: [],
    downloadedAt: Date.now(),
  });
  return { artifactPath: result.metaPath };
}

async function runFrames(ctx: StepContext<ExplosionInput>) {
  const framesDir = artifactPath(ctx.artifactDir, 'frames');
  const keyframesDir = artifactPath(ctx.artifactDir, 'keyframes');
  await extractFrames(artifactPath(ctx.artifactDir, 'source.mp4'), framesDir);
  await mkdir(keyframesDir, { recursive: true });
  const frames = await listJpgs(framesDir);
  for (const frame of frames.slice(0, 6)) {
    await copyFile(frame, join(keyframesDir, frame.split('/').at(-1) ?? 'keyframe.jpg'));
  }
  return { artifactPath: keyframesDir };
}

async function runAsr(ctx: StepContext<ExplosionInput>) {
  const transcript = await ctx.modelClient.asr(artifactPath(ctx.artifactDir, 'source.m4a'));
  return { artifactPath: await writeJson(artifactPath(ctx.artifactDir, 'transcript.json'), transcript) };
}

async function runScriptParse(ctx: StepContext<ExplosionInput>) {
  const keyframes = await listJpgs(artifactPath(ctx.artifactDir, 'keyframes'));
  const transcript = await readJson<TranscriptResult>(artifactPath(ctx.artifactDir, 'transcript.json'));
  const analysis = await ctx.modelClient.vision(
    keyframes,
    `请拆解广告视频分镜、节奏、转场、卖点与 CTA 关键词。ASR 文案：${transcript.text}`,
  );
  const scriptParse: ScriptParse = {
    cta_keywords: ['立即', '下单'],
    scenes: [{ index: 1, summary: analysis }],
  };
  return { artifactPath: await writeJson(artifactPath(ctx.artifactDir, 'script_parse.json'), scriptParse) };
}

async function runRewrite(ctx: StepContext<ExplosionInput>) {
  const transcript = await readJson<TranscriptResult>(artifactPath(ctx.artifactDir, 'transcript.json'));
  const scriptParse = await readJson<ScriptParse>(artifactPath(ctx.artifactDir, 'script_parse.json'));
  const response = await ctx.modelClient.chat(
    [
      {
        role: 'system',
        content: '你是短视频广告编导。输出 JSON 数组，每项包含 index、copy、script。',
      },
      {
        role: 'user',
        content: `基于原文案与分镜裂变 ${ctx.input.variantCount} 条，必须保留 CTA 关键词：${scriptParse.cta_keywords.join(
          ',',
        )}\n原文案：${transcript.text}\n分镜：${JSON.stringify(scriptParse.scenes)}`,
      },
    ],
    { temperature: 0.8 },
  );
  const variants = JSON.parse(response) as Variant[];
  const missingCta = variants.some((variant) =>
    scriptParse.cta_keywords.some((keyword) => !variant.copy.includes(keyword)),
  );
  if (missingCta) {
    throw new AppError('E_CTA_LOST');
  }
  await writeText(
    artifactPath(ctx.artifactDir, 'variants.md'),
    variants.map((item) => `## Variant ${item.index}\n\n${item.copy}\n\n${item.script}`).join('\n\n'),
  );
  return { artifactPath: await writeJson(artifactPath(ctx.artifactDir, 'variants.json'), variants) };
}

async function runSeedance(ctx: StepContext<ExplosionInput>) {
  const variants = await readJson<Variant[]>(artifactPath(ctx.artifactDir, 'variants.json'));
  const keyframes = await listJpgs(artifactPath(ctx.artifactDir, 'keyframes'));
  for (const variant of variants) {
    await ctx.modelClient.generateVideo({
      refVideoPath: artifactPath(ctx.artifactDir, 'source.mp4'),
      refImagePaths: keyframes,
      prompt: `${variant.copy}\n\n${variant.script}`,
      durationSec: 10,
      resolution: '1080x1920',
      outputPath: artifactPath(ctx.artifactDir, `variant_${variant.index}.mp4`),
    });
  }
  return { artifactPath: ctx.artifactDir };
}

async function runAudioReplace(ctx: StepContext<ExplosionInput>) {
  const variants = await readJson<Variant[]>(artifactPath(ctx.artifactDir, 'variants.json'));
  for (const variant of variants) {
    const finalPath = artifactPath(ctx.artifactDir, `final_${variant.index}.mp4`);
    await replaceAudio(
      artifactPath(ctx.artifactDir, `variant_${variant.index}.mp4`),
      artifactPath(ctx.artifactDir, 'source.m4a'),
      finalPath,
    );
    ctx.repository.createAsset({
      taskId: ctx.task.id,
      kind: 'video',
      path: finalPath,
      tags: ['explosion'],
    });
  }
  await writeFile(artifactPath(ctx.artifactDir, '.explosion_done'), 'done', 'utf8');
  return { artifactPath: artifactPath(ctx.artifactDir, '.explosion_done') };
}

export const explosionPipeline: PipelineDefinition<ExplosionInput> = {
  type: 'explosion',
  steps: [
    { name: 'download', runStep: runDownload },
    { name: 'frames', runStep: runFrames },
    { name: 'asr', runStep: runAsr },
    { name: 'script_parse', runStep: runScriptParse },
    { name: 'rewrite', runStep: runRewrite },
    { name: 'seedance', runStep: runSeedance },
    { name: 'audio_replace', runStep: runAudioReplace },
  ],
};
