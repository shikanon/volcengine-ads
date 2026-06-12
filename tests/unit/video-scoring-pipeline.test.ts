import { mkdtempSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { SqliteTaskRepository } from '../../src/main/db/index.js';
import type {
  AudioResult,
  ImageResult,
  ModelClient,
  TranscriptResult,
  VideoResult,
  WebSearchResult,
} from '../../src/main/model-client/index.js';
import { runPipeline } from '../../src/main/pipelines/runner.js';
import { videoScoringPipeline } from '../../src/main/pipelines/video-scoring/index.js';

vi.mock('../../src/main/media/ffmpeg.js', async () => {
  const { mkdir, writeFile } = await import('node:fs/promises');
  const { dirname } = await import('node:path');
  return {
    normalizeVideo: vi.fn(async (_inputPath: string, outputPath: string) => {
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, 'normalized-video', 'utf8');
      return outputPath;
    }),
    extractAudio: vi.fn(async (_inputPath: string, outputPath: string) => {
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, 'audio-track', 'utf8');
      return outputPath;
    }),
    transcodeAudioToWav: vi.fn(async (_inputPath: string, outputPath: string) => {
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, 'wav-track', 'utf8');
      return outputPath;
    }),
  };
});

vi.mock('../../src/main/media/bgm-analysis.js', () => ({
  analyzeBgmWav: vi.fn(async () => ({
    available: true,
    summary: 'BGM 整体能量中等，音色均衡，动态起伏平稳。',
    sampleRate: 44100,
    durationSec: 12.5,
    frameCount: 8,
    energyLevel: 'medium',
    brightness: 'balanced',
    dynamics: 'stable',
    metrics: {
      rms: { mean: 0.05, min: 0.03, max: 0.07 },
      energy: { mean: 8.2, min: 7.1, max: 9.4 },
      zcr: { mean: 0.03, min: 0.01, max: 0.05 },
      spectralCentroid: { mean: 2150, min: 1800, max: 2600 },
      spectralFlatness: { mean: 0.12, min: 0.09, max: 0.18 },
      spectralSpread: { mean: 4200, min: 3900, max: 4700 },
      spectralRolloff: { mean: 6500, min: 6100, max: 6900 },
    },
  })),
  buildBgmAnalysisPromptText: vi.fn(() => 'BGM 本地分析结果：可用。BGM 整体能量中等，音色均衡，动态起伏平稳。'),
  unavailableBgmAnalysis: vi.fn((reason: string) => ({
    available: false,
    summary: reason,
  })),
}));

class VideoScoringMockModelClient implements ModelClient {
  readonly videoRequests: Array<{ videoPath: string; prompt: string }> = [];

  constructor(private readonly responses: string[]) {}

  async generateImage(): Promise<ImageResult> {
    throw new Error('generateImage should not be called');
  }

  async generateVideo(): Promise<VideoResult> {
    throw new Error('generateVideo should not be called');
  }

  async generateDigitalHuman(): Promise<VideoResult> {
    throw new Error('generateDigitalHuman should not be called');
  }

  async asr(): Promise<TranscriptResult> {
    throw new Error('asr should not be called');
  }

  async tts(): Promise<AudioResult> {
    throw new Error('tts should not be called');
  }

  async chat(): Promise<string> {
    throw new Error('chat should not be called');
  }

  async webSearch(): Promise<WebSearchResult> {
    throw new Error('webSearch should not be called');
  }

  async vision(): Promise<string> {
    throw new Error('vision should not be called');
  }

  async visionVideo(videoPath: string, prompt: string): Promise<string> {
    this.videoRequests.push({ videoPath, prompt });
    const response = this.responses.shift();
    if (response === undefined) {
      throw new Error('unexpected visionVideo call');
    }
    return response;
  }
}

describe('videoScoringPipeline', () => {
  it('routes brand video scoring to the brand prompt and writes score/report artifacts', async () => {
    const userDataPath = mkdtempSync(join(tmpdir(), 'video-scoring-pipeline-'));
    const sourceVideoPath = join(userDataPath, 'source-input.mp4');
    writeFileSync(sourceVideoPath, 'video');
    const repository = new SqliteTaskRepository(join(userDataPath, 'tasks.db'));
    const modelClient = new VideoScoringMockModelClient([
      JSON.stringify({
        category: 'brand',
        compliancePass: true,
        complianceIssues: [],
        dimensionScores: {
          品牌露出与一致性: 90,
          制作精良度: 86,
          情感叙事与好感度: 78,
          黄金3秒吸引力: 74,
          新颖度差异化: 70,
        },
        evidence: {
          品牌露出与一致性: '0-3s 高频 Logo + 12s 结尾品牌口号',
        },
        analysis: '品牌资产识别清晰，但首秒氛围进入偏慢。',
        suggestions: ['把核心品牌识别元素提前到 1 秒内', '强化首秒冲突或悬念'],
      }),
    ]);
    const task = repository.createTask({
      request: {
        type: 'video_scoring',
        input: {
          sourceVideoPath,
          category: 'brand',
        },
      },
      stepNames: videoScoringPipeline.steps.map((step) => step.name),
    });

    await runPipeline({
      task,
      pipeline: videoScoringPipeline,
      repository,
      modelClient,
      workflowPrompts: {},
      userDataPath,
      emitProgress: () => undefined,
    });

    const completed = repository.getTask(task.id);
    expect(completed?.status).toBe('success');
    expect(completed?.steps.map((step) => step.step)).toEqual(['ingest', 'score', 'report_writer']);
    expect(completed?.steps.every((step) => step.status === 'success')).toBe(true);
    expect(modelClient.videoRequests[0]?.prompt).toContain('品牌广告');
    expect(modelClient.videoRequests[0]?.prompt).toContain('BGM 本地分析结果');
    expect(modelClient.videoRequests[0]?.videoPath).toBe(join(userDataPath, 'artifacts', task.id, 'source.mp4'));

    await expect(readFile(join(userDataPath, 'artifacts', task.id, 'score.json'), 'utf8')).resolves.toContain(
      '"category": "brand"',
    );
    await expect(readFile(join(userDataPath, 'artifacts', task.id, 'score.json'), 'utf8')).resolves.toContain(
      '"bgmAnalysis"',
    );
    await expect(readFile(join(userDataPath, 'artifacts', task.id, 'report.md'), 'utf8')).resolves.toContain(
      '## BGM 音乐分析',
    );
    expect(repository.listAssets()).toEqual([
      expect.objectContaining({
        taskId: task.id,
        kind: 'report',
        tags: ['video_scoring', 'brand'],
      }),
    ]);
  });

  it('keeps a non-compliant scoring task successful while returning partial results', async () => {
    const userDataPath = mkdtempSync(join(tmpdir(), 'video-scoring-pipeline-'));
    const sourceVideoPath = join(userDataPath, 'creative-input.mp4');
    writeFileSync(sourceVideoPath, 'video');
    const repository = new SqliteTaskRepository(join(userDataPath, 'tasks.db'));
    const modelClient = new VideoScoringMockModelClient([
      JSON.stringify({
        category: 'creative',
        compliancePass: false,
        complianceIssues: ['疑似夸大宣传，福利承诺无法验证'],
        dimensionScores: {},
        evidence: {},
        analysis: '当前素材有记忆点，但核心利益表达存在审核风险。',
        suggestions: ['删除不可验证福利承诺', '保留创意冲突，改用真实使用场景证明'],
      }),
    ]);
    const task = repository.createTask({
      request: {
        type: 'video_scoring',
        input: {
          sourceVideoPath,
          category: 'creative',
        },
      },
      stepNames: videoScoringPipeline.steps.map((step) => step.name),
    });

    await runPipeline({
      task,
      pipeline: videoScoringPipeline,
      repository,
      modelClient,
      workflowPrompts: {},
      userDataPath,
      emitProgress: () => undefined,
    });

    const completed = repository.getTask(task.id);
    expect(completed?.status).toBe('success');
    expect(modelClient.videoRequests[0]?.prompt).toContain('创意广告');
    expect(modelClient.videoRequests[0]?.prompt).toContain('BGM 本地分析结果');

    const scoreJson = await readFile(join(userDataPath, 'artifacts', task.id, 'score.json'), 'utf8');
    expect(scoreJson).toContain('"compliancePass": false');
    expect(scoreJson).toContain('"dimensionScores": {}');
    expect(scoreJson).toContain('"bgmAnalysis"');
    await expect(readFile(join(userDataPath, 'artifacts', task.id, 'report.md'), 'utf8')).resolves.toContain(
      '## 合规问题',
    );
  });
});
