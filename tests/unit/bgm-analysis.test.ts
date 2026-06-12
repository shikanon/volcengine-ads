import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  analyzeBgmWav,
  buildBgmAnalysisPromptText,
  unavailableBgmAnalysis,
} from '../../src/main/media/bgm-analysis.js';

function createMonoPcm16Wav(samples: Int16Array, sampleRate: number): Buffer {
  const dataSize = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8, 'ascii');
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(dataSize, 40);
  for (let index = 0; index < samples.length; index += 1) {
    buffer.writeInt16LE(samples[index] ?? 0, 44 + index * 2);
  }
  return buffer;
}

describe('bgm-analysis', () => {
  it('extracts meyda metrics from wav audio', async () => {
    const sampleRate = 44100;
    const durationSec = 1;
    const sampleCount = sampleRate * durationSec;
    const waveform = new Int16Array(sampleCount);
    for (let index = 0; index < sampleCount; index += 1) {
      waveform[index] = Math.round(Math.sin((2 * Math.PI * 440 * index) / sampleRate) * 14000);
    }
    const wavPath = join(mkdtempSync(join(tmpdir(), 'bgm-analysis-')), 'tone.wav');
    writeFileSync(wavPath, createMonoPcm16Wav(waveform, sampleRate));

    const analysis = await analyzeBgmWav(wavPath);

    expect(analysis.available).toBe(true);
    expect(analysis.sampleRate).toBe(sampleRate);
    expect(analysis.durationSec).toBeCloseTo(1, 1);
    expect(analysis.frameCount).toBeGreaterThan(0);
    expect(analysis.metrics?.rms.mean).toBeGreaterThan(0);
    expect(analysis.metrics?.spectralCentroid.mean).toBeGreaterThan(0);
    expect(buildBgmAnalysisPromptText(analysis)).toContain('BGM 本地分析结果：可用');
  });

  it('builds a degraded prompt text when analysis is unavailable', () => {
    const analysis = unavailableBgmAnalysis('未检测到可分析的 BGM 音轨。');
    expect(buildBgmAnalysisPromptText(analysis)).toContain('不可用');
  });
});
