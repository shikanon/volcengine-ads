import { copyFile } from 'node:fs/promises';

import pLimit from 'p-limit';

import { AppError } from '../../errors.js';
import { trimVideo } from '../../media/ffmpeg.js';
import type { NativeIndustry, NativeInput } from '../../../shared/types.js';
import { NATIVE_INDUSTRY_DEFINITIONS } from '../../../shared/workflows.js';
import {
  artifactPath,
  parseModelJson,
  readJson,
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
  videoPath: string;
  audioPath?: string;
}

interface NativeAssets {
  assets: NativeAsset[];
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
  if (plan.concepts.some((concept) => !concept.title || !concept.hook || !Array.isArray(concept.sellingPoints))) {
    throw new AppError('E_MODEL_API_FAILED', '行业概念规划缺少必要字段');
  }
  return plan;
}

function ensureScripts(bundle: ScriptBundle): ScriptBundle {
  if (!Array.isArray(bundle.scripts) || bundle.scripts.length === 0) {
    throw new AppError('E_MODEL_API_FAILED', '行业脚本为空');
  }
  if (bundle.scripts.some((script) => !script.title || !script.script || !Array.isArray(script.beats))) {
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
        `镜头 ${shot.index}（${shot.durationSec}s）：${shot.videoPrompt}。场景图：${shot.imagePrompt}。口播/字幕：${shot.voiceoverText ?? ''}。模块：${shot.module ?? ''}`,
    )
    .join('\n');
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
  return /InputVideoSensitiveContentDetected|real person|reference_video/iu.test(message);
}

async function runIndustryRouter(ctx: StepContext<NativeInput>) {
  const route = createRoute(ctx.input);
  return { artifactPath: await writeJson(artifactPath(ctx.artifactDir, 'industry.json'), route) };
}

async function runConceptPlanner(ctx: StepContext<NativeInput>) {
  const route = await readJson<IndustryRoute>(artifactPath(ctx.artifactDir, 'industry.json'));
  const response = await ctx.modelClient.chat([
    { role: 'system', content: '你是五行业短视频广告策略规划师，只输出合法 JSON。' },
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
  return { artifactPath: await writeJson(artifactPath(ctx.artifactDir, 'storyboard.json'), storyboard) };
}

async function runCompliancePre(ctx: StepContext<NativeInput>) {
  const route = await readJson<IndustryRoute>(artifactPath(ctx.artifactDir, 'industry.json'));
  let storyboard = await readJson<StoryboardBundle>(artifactPath(ctx.artifactDir, 'storyboard.json'));
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
  const storyboard = await readJson<StoryboardBundle>(artifactPath(ctx.artifactDir, 'storyboard.json'));
  const limit = pLimit(4);
  const durationSec = Math.min(Math.max(ctx.input.durationSec, 4), 15);
  const referenceVideoPath =
    ctx.input.referenceVideoPath !== undefined
      ? await trimVideo(
          ctx.input.referenceVideoPath,
          artifactPath(ctx.artifactDir, 'seedance_reference.mp4'),
          Math.min(durationSec, 4),
          seedanceReferenceFilter(ctx.input.ratio),
        )
      : undefined;
  const assets = await Promise.all(
    storyboard.variants.map((variant) =>
      limit(async (): Promise<NativeAsset> => {
        const videoPath = artifactPath(ctx.artifactDir, `asset_variant_${variant.index}.mp4`);
        const videoRequest = {
          prompt: workflowPrompt(ctx, 'native.asset_generator', {
            industryTitle: route.title,
            title: variant.title,
            script: variant.script,
            storyboard: storyboardPromptText(variant),
            ratio: ctx.input.ratio,
          }),
          durationSec,
          resolution: ctx.input.ratio === '16:9' ? '1080p' : '720p',
          outputPath: videoPath,
          ...(referenceVideoPath !== undefined ? { refVideoPath: referenceVideoPath } : {}),
        };
        try {
          await ctx.modelClient.generateVideo(videoRequest);
        } catch (error) {
          if (referenceVideoPath === undefined || !isReferenceVideoRejected(error)) {
            throw error;
          }
          await ctx.modelClient.generateVideo({
            prompt: videoRequest.prompt,
            durationSec: videoRequest.durationSec,
            resolution: videoRequest.resolution,
            outputPath: videoRequest.outputPath,
          });
        }

        const voiceover = variant.voiceover ?? variant.shots.map((shot) => shot.voiceoverText).filter(Boolean).join(' ');
        if (!voiceover) {
          return { index: variant.index, title: variant.title, videoPath };
        }
        const audio = await ctx.modelClient.tts(voiceover, 'zh_female_vv_uranus_bigtts');
        return {
          index: variant.index,
          title: variant.title,
          videoPath,
          audioPath: audio.localPath,
        };
      }),
    ),
  );
  return {
    artifactPath: await writeJson(artifactPath(ctx.artifactDir, 'assets.json'), { assets }),
  };
}

async function runConsistencyChecker(ctx: StepContext<NativeInput>) {
  const route = await readJson<IndustryRoute>(artifactPath(ctx.artifactDir, 'industry.json'));
  const storyboard = await readJson<StoryboardBundle>(artifactPath(ctx.artifactDir, 'storyboard.json'));
  const nativeAssets = await readJson<NativeAssets>(artifactPath(ctx.artifactDir, 'assets.json'));
  const checks: ConsistencyItem[] = [];

  for (const asset of nativeAssets.assets) {
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
  return { artifactPath: await writeJson(artifactPath(ctx.artifactDir, 'consistency.json'), report) };
}

async function runComposer(ctx: StepContext<NativeInput>) {
  const route = await readJson<IndustryRoute>(artifactPath(ctx.artifactDir, 'industry.json'));
  const storyboard = await readJson<StoryboardBundle>(artifactPath(ctx.artifactDir, 'storyboard.json'));
  const nativeAssets = await readJson<NativeAssets>(artifactPath(ctx.artifactDir, 'assets.json'));
  const finalPaths: string[] = [];
  const violations = findComplianceViolations(route, storyboard);
  if (violations.length > 0) {
    throw new AppError('E_INPUT_VALIDATION', `成片合规校验未通过：${violations.join('；')}`);
  }

  for (const asset of nativeAssets.assets) {
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
    { name: 'storyboard_builder', runStep: runStoryboardBuilder },
    { name: 'compliance_pre', runStep: runCompliancePre },
    { name: 'asset_generator', runStep: runAssetGenerator },
    { name: 'consistency_checker', runStep: runConsistencyChecker },
    { name: 'composer', runStep: runComposer },
  ],
};
