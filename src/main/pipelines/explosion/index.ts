import { writeFile } from 'node:fs/promises';

import { AppError } from '../../errors.js';
import { downloadDouyinVideo } from '../../media/douyin.js';
import { extractAudio, normalizeVideo, replaceAudio, trimVideo } from '../../media/ffmpeg.js';
import type { TranscriptResult } from '../../model-client/index.js';
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

function isReferenceVideoRejected(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /InputVideoSensitiveContentDetected|real person|reference_video|video duration|video pixel/iu.test(message);
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
    workflowPrompt(ctx, 'explosion.script_parse', { transcriptText: transcript.text }),
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
          transcriptText: transcript.text,
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
  for (const variant of variants) {
    const storyboardPrompt = variant.storyboard
      .map(
        (shot) =>
          `镜头 ${shot.index}（${shot.durationSec ?? 2}s）：${shot.visualPrompt}。旁白/字幕：${shot.narration ?? ''}。转场：${shot.transition ?? ''}`,
      )
      .join('\n');
    const request = {
      refVideoPath: referencePath,
      prompt: workflowPrompt(ctx, 'explosion.seedance', {
        copy: variant.copy,
        script: variant.script,
        storyboard: storyboardPrompt,
      }),
      durationSec: 10,
      resolution: '1080x1920',
      outputPath: artifactPath(ctx.artifactDir, `variant_${variant.index}.mp4`),
    };
    try {
      await ctx.modelClient.generateVideo(request);
    } catch (error) {
      if (!isReferenceVideoRejected(error)) {
        throw error;
      }
      await ctx.modelClient.generateVideo({
        prompt: request.prompt,
        durationSec: request.durationSec,
        resolution: request.resolution,
        outputPath: request.outputPath,
      });
    }
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
    { name: 'asr', runStep: runAsr },
    { name: 'script_parse', runStep: runScriptParse },
    { name: 'rewrite', runStep: runRewrite },
    { name: 'seedance', runStep: runSeedance },
    { name: 'audio_replace', runStep: runAudioReplace },
  ],
};
