import { readFile } from 'node:fs/promises';

import type {
  VideoScoringAudioMetric,
  VideoScoringBgmAnalysis,
} from '../../shared/types.js';

const BUFFER_SIZE = 2048;
const HOP_SIZE = 1024;

type NumericFeatureName =
  | 'rms'
  | 'energy'
  | 'zcr'
  | 'spectralCentroid'
  | 'spectralFlatness'
  | 'spectralSpread'
  | 'spectralRolloff';

const FEATURE_NAMES: NumericFeatureName[] = [
  'rms',
  'energy',
  'zcr',
  'spectralCentroid',
  'spectralFlatness',
  'spectralSpread',
  'spectralRolloff',
];

interface ParsedWav {
  sampleRate: number;
  samples: Float32Array;
}

interface MeydaRuntime {
  bufferSize: number;
  sampleRate: number;
  extract(
    features: NumericFeatureName[],
    signal: Float32Array,
  ): Partial<Record<NumericFeatureName, number>> | null;
}

function round(value: number, digits = 4): number {
  return Number(value.toFixed(digits));
}

function getChunkId(buffer: Buffer, offset: number): string {
  return buffer.toString('ascii', offset, offset + 4);
}

function parseWav(buffer: Buffer): ParsedWav {
  if (getChunkId(buffer, 0) !== 'RIFF' || getChunkId(buffer, 8) !== 'WAVE') {
    throw new Error('仅支持 WAV RIFF 音频');
  }

  let offset = 12;
  let sampleRate: number | undefined;
  let channels: number | undefined;
  let bitsPerSample: number | undefined;
  let dataChunk: Buffer | undefined;

  while (offset + 8 <= buffer.length) {
    const chunkId = getChunkId(buffer, offset);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;

    if (chunkId === 'fmt ') {
      const format = buffer.readUInt16LE(chunkStart);
      channels = buffer.readUInt16LE(chunkStart + 2);
      sampleRate = buffer.readUInt32LE(chunkStart + 4);
      bitsPerSample = buffer.readUInt16LE(chunkStart + 14);
      if (format !== 1) {
        throw new Error('仅支持 PCM WAV 音频');
      }
    } else if (chunkId === 'data') {
      dataChunk = buffer.subarray(chunkStart, chunkStart + chunkSize);
    }

    offset = chunkStart + chunkSize + (chunkSize % 2);
  }

  if (
    sampleRate === undefined ||
    channels === undefined ||
    bitsPerSample === undefined ||
    dataChunk === undefined
  ) {
    throw new Error('WAV 音频缺少必要 chunk');
  }
  if (bitsPerSample !== 16) {
    throw new Error('仅支持 16-bit PCM WAV 音频');
  }

  const sampleCount = dataChunk.length / 2 / channels;
  const samples = new Float32Array(sampleCount);

  for (let index = 0; index < sampleCount; index += 1) {
    let mixed = 0;
    for (let channel = 0; channel < channels; channel += 1) {
      const byteOffset = (index * channels + channel) * 2;
      mixed += dataChunk.readInt16LE(byteOffset) / 32768;
    }
    samples[index] = mixed / channels;
  }

  return {
    sampleRate,
    samples,
  };
}

function createMetric(values: number[]): VideoScoringAudioMetric {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return {
    mean: round(mean),
    min: round(min),
    max: round(max),
  };
}

function classifyEnergy(rmsMean: number): NonNullable<VideoScoringBgmAnalysis['energyLevel']> {
  if (rmsMean < 0.03) {
    return 'low';
  }
  if (rmsMean < 0.08) {
    return 'medium';
  }
  return 'high';
}

function classifyBrightness(
  spectralCentroidMean: number,
  sampleRate: number,
): NonNullable<VideoScoringBgmAnalysis['brightness']> {
  const ratio = spectralCentroidMean / (sampleRate / 2);
  if (ratio < 0.18) {
    return 'dark';
  }
  if (ratio < 0.38) {
    return 'balanced';
  }
  return 'bright';
}

function classifyDynamics(
  rmsMetric: VideoScoringAudioMetric,
): NonNullable<VideoScoringBgmAnalysis['dynamics']> {
  const range = rmsMetric.max - rmsMetric.min;
  if (range < 0.03) {
    return 'stable';
  }
  if (range < 0.08) {
    return 'dynamic';
  }
  return 'high_dynamic';
}

function describeEnergy(value: NonNullable<VideoScoringBgmAnalysis['energyLevel']>): string {
  if (value === 'low') return '偏低';
  if (value === 'medium') return '中等';
  return '偏高';
}

function describeBrightness(value: NonNullable<VideoScoringBgmAnalysis['brightness']>): string {
  if (value === 'dark') return '偏暗';
  if (value === 'balanced') return '均衡';
  return '偏亮';
}

function describeDynamics(value: NonNullable<VideoScoringBgmAnalysis['dynamics']>): string {
  if (value === 'stable') return '平稳';
  if (value === 'dynamic') return '有起伏';
  return '起伏明显';
}

export function unavailableBgmAnalysis(reason: string): VideoScoringBgmAnalysis {
  return {
    available: false,
    summary: reason,
  };
}

export function buildBgmAnalysisPromptText(analysis: VideoScoringBgmAnalysis): string {
  if (!analysis.available) {
    return `BGM 本地分析结果：不可用。${analysis.summary}`;
  }
  const metrics = analysis.metrics;
  if (!metrics) {
    return `BGM 本地分析结果：可用。${analysis.summary}`;
  }
  return [
    `BGM 本地分析结果：可用。${analysis.summary}`,
    `时长 ${analysis.durationSec ?? 0}s，采样率 ${analysis.sampleRate ?? 0}Hz，分析帧数 ${analysis.frameCount ?? 0}。`,
    `RMS 均值 ${metrics.rms.mean}，能量均值 ${metrics.energy.mean}，频谱质心均值 ${metrics.spectralCentroid.mean}Hz，频谱平坦度均值 ${metrics.spectralFlatness.mean}，滚降频率均值 ${metrics.spectralRolloff.mean}Hz。`,
  ].join(' ');
}

export async function analyzeBgmWav(wavPath: string): Promise<VideoScoringBgmAnalysis> {
  const buffer = await readFile(wavPath);
  const { sampleRate, samples } = parseWav(buffer);

  if (samples.length === 0) {
    return unavailableBgmAnalysis('未检测到可分析的音频样本。');
  }

  const { default: MeydaModule } = await import('meyda');
  const Meyda = MeydaModule as unknown as MeydaRuntime;
  Meyda.bufferSize = BUFFER_SIZE;
  Meyda.sampleRate = sampleRate;

  const buckets: Record<NumericFeatureName, number[]> = {
    rms: [],
    energy: [],
    zcr: [],
    spectralCentroid: [],
    spectralFlatness: [],
    spectralSpread: [],
    spectralRolloff: [],
  };

  for (let offset = 0; offset < samples.length; offset += HOP_SIZE) {
    const frame = new Float32Array(BUFFER_SIZE);
    frame.set(samples.subarray(offset, Math.min(offset + BUFFER_SIZE, samples.length)));
    const features = Meyda.extract(FEATURE_NAMES, frame);
    if (!features) {
      continue;
    }
    for (const featureName of FEATURE_NAMES) {
      const value = features[featureName];
      if (typeof value === 'number' && Number.isFinite(value)) {
        buckets[featureName].push(value);
      }
    }
  }

  if (buckets.rms.length === 0) {
    return unavailableBgmAnalysis('音轨过短，无法稳定提取 BGM 特征。');
  }

  const metrics = {
    rms: createMetric(buckets.rms),
    energy: createMetric(buckets.energy),
    zcr: createMetric(buckets.zcr),
    spectralCentroid: createMetric(buckets.spectralCentroid),
    spectralFlatness: createMetric(buckets.spectralFlatness),
    spectralSpread: createMetric(buckets.spectralSpread),
    spectralRolloff: createMetric(buckets.spectralRolloff),
  };

  const energyLevel = classifyEnergy(metrics.rms.mean);
  const brightness = classifyBrightness(metrics.spectralCentroid.mean, sampleRate);
  const dynamics = classifyDynamics(metrics.rms);

  return {
    available: true,
    summary: `BGM 整体能量${describeEnergy(energyLevel)}，音色${describeBrightness(
      brightness,
    )}，动态起伏${describeDynamics(dynamics)}。`,
    sampleRate,
    durationSec: round(samples.length / sampleRate, 2),
    frameCount: buckets.rms.length,
    energyLevel,
    brightness,
    dynamics,
    metrics,
  };
}
