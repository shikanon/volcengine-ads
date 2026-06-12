import {
  analyzeBgmWav,
  buildBgmAnalysisPromptText,
  unavailableBgmAnalysis,
} from '../../media/bgm-analysis.js';
import { extractAudio, normalizeVideo, transcodeAudioToWav } from '../../media/ffmpeg.js';
import { AppError } from '../../errors.js';
import {
  VIDEO_SCORING_CATEGORY_DEFINITIONS,
  type AdVideoScoringCategory,
  type VideoScoringInput,
  type VideoScoringBgmAnalysis,
  type VideoScoringResult,
} from '../../../shared/types.js';
import type { WorkflowPromptId } from '../../../shared/workflows.js';
import {
  artifactPath,
  parseModelJson,
  readJson,
  workflowPrompt,
  writeJson,
  writeText,
} from '../helpers.js';
import type { PipelineDefinition, StepContext } from '../types.js';

interface VideoScoringDraft {
  category?: unknown;
  compliancePass?: unknown;
  complianceIssues?: unknown;
  dimensionScores?: unknown;
  evidence?: unknown;
  analysis?: unknown;
  suggestions?: unknown;
}

const CATEGORY_LABELS = Object.fromEntries(
  VIDEO_SCORING_CATEGORY_DEFINITIONS.map((definition) => [definition.value, definition.label]),
) as Record<AdVideoScoringCategory, string>;

const SCORE_PROMPT_IDS: Record<AdVideoScoringCategory, WorkflowPromptId> = {
  brand: 'video_scoring.brand_score',
  performance: 'video_scoring.performance_score',
  creative: 'video_scoring.creative_score',
};

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim());
}

function normalizeScore(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeDimensionScores(value: unknown): Record<string, number> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }
  const normalized: Record<string, number> = {};
  for (const [key, score] of Object.entries(value)) {
    const cleanKey = key.trim();
    const cleanScore = normalizeScore(score);
    if (cleanKey && cleanScore !== undefined) {
      normalized[cleanKey] = cleanScore;
    }
  }
  return normalized;
}

function normalizeEvidence(value: unknown): Record<string, string> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }
  const normalized: Record<string, string> = {};
  for (const [key, evidence] of Object.entries(value)) {
    if (typeof evidence !== 'string' || evidence.trim().length === 0) {
      continue;
    }
    const cleanKey = key.trim();
    if (cleanKey) {
      normalized[cleanKey] = evidence.trim();
    }
  }
  return normalized;
}

function ensureVideoScoringResult(
  inputCategory: AdVideoScoringCategory,
  draft: VideoScoringDraft,
  bgmAnalysis: VideoScoringBgmAnalysis,
): VideoScoringResult {
  const analysis =
    typeof draft.analysis === 'string' && draft.analysis.trim().length > 0
      ? draft.analysis.trim()
      : '未提供整体分析。';
  const suggestions = normalizeStringArray(draft.suggestions);
  const dimensionScores = normalizeDimensionScores(draft.dimensionScores);
  return {
    category: inputCategory,
    compliancePass: draft.compliancePass !== false,
    complianceIssues: normalizeStringArray(draft.complianceIssues),
    dimensionScores,
    evidence: normalizeEvidence(draft.evidence),
    analysis,
    suggestions,
    bgmAnalysis,
  };
}

function renderMarkdown(result: VideoScoringResult): string {
  const label = CATEGORY_LABELS[result.category];
  const scoreEntries = Object.entries(result.dimensionScores);
  const evidenceEntries = Object.entries(result.evidence);
  const lines = [
    `# 广告视频打分报告`,
    '',
    `- 广告类型：${label}`,
    `- 合规状态：${result.compliancePass ? '通过' : '未通过'}`,
    `- 评分维度数：${scoreEntries.length}`,
    '',
  ];
  if (result.complianceIssues.length > 0) {
    lines.push('## 合规问题', '');
    for (const issue of result.complianceIssues) {
      lines.push(`- ${issue}`);
    }
    lines.push('');
  }
  if (scoreEntries.length > 0) {
    lines.push('## 维度分数', '', '| 维度 | 分数 |', '|---|---|');
    for (const [dimension, score] of scoreEntries) {
      lines.push(`| ${dimension} | ${score} |`);
    }
    lines.push('');
  }
  if (evidenceEntries.length > 0) {
    lines.push('## 证据时间点', '');
    for (const [dimension, evidence] of evidenceEntries) {
      lines.push(`- ${dimension}：${evidence}`);
    }
    lines.push('');
  }
  if (result.bgmAnalysis) {
    lines.push('## BGM 音乐分析', '', result.bgmAnalysis.summary, '');
  }
  lines.push('## 整体分析', '', result.analysis, '');
  if (result.suggestions.length > 0) {
    lines.push('## 优化建议', '');
    for (const suggestion of result.suggestions) {
      lines.push(`- ${suggestion}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

async function runIngest(ctx: StepContext<VideoScoringInput>) {
  const source = artifactPath(ctx.artifactDir, 'source.mp4');
  await normalizeVideo(ctx.input.sourceVideoPath, source);
  return { artifactPath: source };
}

async function runScore(ctx: StepContext<VideoScoringInput>) {
  const promptId = SCORE_PROMPT_IDS[ctx.input.category];
  if (!promptId) {
    throw new AppError('E_INPUT_VALIDATION', '广告视频类型不支持');
  }
  let bgmAnalysis = unavailableBgmAnalysis('未完成 BGM 本地分析。');
  try {
    const audioPath = await extractAudio(
      artifactPath(ctx.artifactDir, 'source.mp4'),
      artifactPath(ctx.artifactDir, 'source.m4a'),
    );
    const wavPath = await transcodeAudioToWav(audioPath, artifactPath(ctx.artifactDir, 'bgm.wav'));
    bgmAnalysis = await analyzeBgmWav(wavPath);
  } catch (error) {
    bgmAnalysis = unavailableBgmAnalysis('未检测到可分析的 BGM 音轨或本地分析失败。');
    await ctx.appendLog?.(
      'warn',
      `BGM 分析跳过：${error instanceof Error ? error.message : String(error)}`,
    );
  }
  await writeJson(artifactPath(ctx.artifactDir, 'bgm_analysis.json'), bgmAnalysis);
  const response = await ctx.modelClient.visionVideo(
    artifactPath(ctx.artifactDir, 'source.mp4'),
    workflowPrompt(ctx, promptId, {
      bgmAnalysisText: buildBgmAnalysisPromptText(bgmAnalysis),
    }),
  );
  const result = ensureVideoScoringResult(
    ctx.input.category,
    parseModelJson<VideoScoringDraft>(response, '广告视频评分结果'),
    bgmAnalysis,
  );
  return {
    artifactPath: await writeJson(artifactPath(ctx.artifactDir, 'score.json'), result),
  };
}

async function runReportWriter(ctx: StepContext<VideoScoringInput>) {
  const result = await readJson<VideoScoringResult>(artifactPath(ctx.artifactDir, 'score.json'));
  const reportPath = await writeText(artifactPath(ctx.artifactDir, 'report.md'), renderMarkdown(result));
  ctx.repository.createAsset({
    taskId: ctx.task.id,
    kind: 'report',
    path: reportPath,
    tags: ['video_scoring', result.category],
  });
  return { artifactPath: reportPath };
}

export const videoScoringPipeline: PipelineDefinition<VideoScoringInput> = {
  type: 'video_scoring',
  steps: [
    { name: 'ingest', runStep: runIngest },
    { name: 'score', runStep: runScore },
    { name: 'report_writer', runStep: runReportWriter },
  ],
};
