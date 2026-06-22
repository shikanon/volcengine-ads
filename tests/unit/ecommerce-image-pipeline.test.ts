import { mkdtempSync, writeFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { CreateTaskWithSteps, TaskRepository } from '../../src/main/db/index.js';
import type {
  AudioResult,
  ChatMessage,
  ImageResult,
  ModelClient,
  SeedreamImageRequest,
  TranscriptResult,
  VideoResult,
} from '../../src/main/model-client/index.js';
import { ecommerceImagePipeline } from '../../src/main/pipelines/ecommerce-image/index.js';
import { runPipeline } from '../../src/main/pipelines/runner.js';
import type { AssetRecord, TaskRecord, TaskStatus } from '../../src/shared/types.js';

type MockKeyword = {
  text: string;
  partOfSpeech: 'noun' | 'adjective' | 'verb' | 'other';
  emphasis: 'high' | 'medium' | 'low';
};

interface RenderPlanFixture {
  headline: string;
  subHeadline: string;
  badges: string[];
  emphasizedKeywords: string[];
  colorStrategy: string;
  layoutConstraints: string[];
  items: Array<{
    variantIndex: number;
    sourceBackgroundPath: string;
    scene: string;
    style: string;
    textPlacement: string;
    readabilityRules: string[];
    forbiddenRegions: string[];
    renderConstraints: string[];
  }>;
}

interface FinalsFixture {
  finals: Array<{
    index: number;
    status: 'success';
    path: string;
    sourceBackgroundPath: string;
    prompt: string;
    headline: string;
    subHeadline: string;
    badges: string[];
    emphasizedKeywords: string[];
    riskNotes: string[];
    qualityNotes: string[];
    scene: string;
    style: string;
    renderPlan: RenderPlanFixture['items'][number];
  }>;
}

class MemoryTaskRepository implements TaskRepository {
  private task: TaskRecord | undefined;
  private readonly assets: AssetRecord[] = [];
  private readonly settings = new Map<string, string>();

  createTask(params: CreateTaskWithSteps): TaskRecord {
    const now = Date.now();
    const task: TaskRecord = {
      id: 'task-ecommerce-image',
      type: params.request.type,
      status: 'queued',
      progress: 0,
      input: params.request.input,
      createdAt: now,
      updatedAt: now,
      steps: params.stepNames.map((step, index) => ({
        id: `step-${index}`,
        step,
        status: 'pending',
      })),
    };
    this.task = task;
    return task;
  }

  cloneTask(): TaskRecord | undefined {
    return undefined;
  }

  listTasks(): TaskRecord[] {
    return this.task ? [this.task] : [];
  }

  getTask(taskId: string): TaskRecord | undefined {
    return this.task?.id === taskId ? this.task : undefined;
  }

  cancelTask(): TaskRecord | undefined {
    return undefined;
  }

  deleteTask(): boolean {
    return false;
  }

  updateTaskStatus(taskId: string, status: TaskStatus, progress: number, error?: string): void {
    if (!this.task || this.task.id !== taskId) {
      return;
    }
    this.task = {
      ...this.task,
      status,
      progress,
      updatedAt: Date.now(),
      ...(error !== undefined ? { error } : {}),
    };
  }

  updateTaskProgress(taskId: string, progress: number): void {
    if (!this.task || this.task.id !== taskId) {
      return;
    }
    this.task = { ...this.task, progress, updatedAt: Date.now() };
  }

  updateStepRunning(taskId: string, step: string): void {
    this.updateStep(taskId, step, { status: 'running', startedAt: Date.now() });
  }

  updateStepWaitingConfirmation(taskId: string, step: string, artifactPath?: string, logs?: string): void {
    this.updateStep(taskId, step, {
      status: 'waiting_confirmation',
      ...(artifactPath !== undefined ? { artifactPath } : {}),
      ...(logs !== undefined ? { logs } : {}),
    });
  }

  updateStepSuccess(taskId: string, step: string, artifactPath?: string, logs?: string): void {
    this.updateStep(taskId, step, {
      status: 'success',
      ...(artifactPath !== undefined ? { artifactPath } : {}),
      ...(logs !== undefined ? { logs } : {}),
      finishedAt: Date.now(),
    });
  }

  updateStepFailed(taskId: string, step: string, error: string): void {
    this.updateStep(taskId, step, { status: 'failed', logs: error, finishedAt: Date.now() });
  }

  confirmWaitingStep(): TaskRecord | undefined {
    return undefined;
  }

  resetStepAndFollowing(): void {
    return undefined;
  }

  listAssets(): AssetRecord[] {
    return this.assets;
  }

  createAsset(asset: Omit<AssetRecord, 'id' | 'createdAt'>): AssetRecord {
    const created: AssetRecord = {
      ...asset,
      id: `asset-${this.assets.length}`,
      createdAt: Date.now(),
    };
    this.assets.unshift(created);
    return created;
  }

  getSetting(key: string): string | undefined {
    return this.settings.get(key);
  }

  setSetting(key: string, value: string): void {
    this.settings.set(key, value);
  }

  pauseRunningTasks(): number {
    return 0;
  }

  private updateStep(taskId: string, stepName: string, patch: Partial<TaskRecord['steps'][number]>): void {
    if (!this.task || this.task.id !== taskId) {
      return;
    }
    this.task = {
      ...this.task,
      steps: this.task.steps.map((step) => (step.step === stepName ? { ...step, ...patch } : step)),
    };
  }
}

class EcommerceImageMockModelClient implements ModelClient {
  readonly imageRequests: SeedreamImageRequest[] = [];
  readonly chatMessages: ChatMessage[][] = [];

  constructor(private readonly keywords: MockKeyword[] = [
    { text: '洗面奶', partOfSpeech: 'noun', emphasis: 'high' },
    { text: '温和', partOfSpeech: 'adjective', emphasis: 'medium' },
  ]) {}

  async generateImage(req: SeedreamImageRequest): Promise<ImageResult> {
    this.imageRequests.push(req);
    await mkdir(dirname(req.outputPath), { recursive: true });
    await writeFile(req.outputPath, `image:${req.outputPath}`, 'utf8');
    return { localPath: req.outputPath };
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

  async chat(messages: ChatMessage[]): Promise<string> {
    this.chatMessages.push(messages);
    return JSON.stringify({
      headline: '深层洁净不紧绷',
      subHeadline: '氨基酸洗面奶 通勤必备',
      badges: ['温和清洁', '细腻泡沫'],
      keywords: this.keywords,
      styleHints: ['stroke', 'background'],
      colorStrategy: '左上角取深蓝，右下角取深棕。',
      riskControl: '不写绝对化功效。',
    });
  }

  async webSearch(): Promise<never> {
    throw new Error('webSearch should not be called');
  }

  async vision(): Promise<string> {
    return JSON.stringify({
      productName: '氨基酸洗面奶',
      category: '护肤清洁',
      visualFeatures: ['白色软管包装', '蓝色标签'],
      suspectedTextNoise: ['右上角促销贴纸'],
      backgroundIssues: ['杂乱桌面'],
      sellingPoints: ['温和清洁', '泡沫细腻'],
      complianceRisks: [],
    });
  }

  async visionVideo(): Promise<never> {
    throw new Error('visionVideo should not be called');
  }
}

describe('ecommerceImagePipeline', () => {
  it('keeps ecommerce image step names unchanged', () => {
    expect(ecommerceImagePipeline.steps.map((step) => step.name)).toEqual([
      'product_understand',
      'copy_generate',
      'main_image_beautify',
      'background_replace',
      'copy_render',
    ]);
  });

  it('packages product image, writes render metadata, and registers intermediate and final image assets', async () => {
    const userDataPath = mkdtempSync(join(tmpdir(), 'volcengine-ads-'));
    const productImagePath = join(userDataPath, 'product.png');
    writeFileSync(productImagePath, 'product-image');
    const repository = new MemoryTaskRepository();
    const task = repository.createTask({
      request: {
        type: 'ecommerce_image',
        input: {
          productImagePath,
          productName: '氨基酸洗面奶',
          sellingPoints: '温和清洁，通勤可用',
          fixedCopy: '快来抖音购物',
          scenePrompt: '清晨浴室台面',
          variantCount: 2,
          style: 'promotion',
        },
      },
      stepNames: ecommerceImagePipeline.steps.map((step) => step.name),
    });
    const modelClient = new EcommerceImageMockModelClient();

    await runPipeline({
      task,
      pipeline: ecommerceImagePipeline,
      repository,
      modelClient,
      workflowPrompts: {},
      userDataPath,
      emitProgress: () => undefined,
    });

    expect(repository.getTask(task.id)?.status).toBe('success');
    expect(modelClient.imageRequests.map((request) => request.outputPath)).toEqual([
      join(userDataPath, 'artifacts', task.id, 'beautified.png'),
      join(userDataPath, 'artifacts', task.id, 'background_variant_1.png'),
      join(userDataPath, 'artifacts', task.id, 'background_variant_2.png'),
      join(userDataPath, 'artifacts', task.id, 'final_1.png'),
      join(userDataPath, 'artifacts', task.id, 'final_2.png'),
    ]);
    const assets = repository.listAssets();
    expect(assets).toHaveLength(5);
    expect(assets.map((asset) => asset.kind)).toEqual(['image', 'image', 'image', 'image', 'image']);
    expect(assets.map((asset) => ({ path: asset.path, tags: asset.tags }))).toEqual(
      expect.arrayContaining([
        {
          path: join(userDataPath, 'artifacts', task.id, 'beautified.png'),
          tags: ['ecommerce_image', 'beautified', 'promotion', '护肤清洁'],
        },
        {
          path: join(userDataPath, 'artifacts', task.id, 'background_variant_1.png'),
          tags: ['ecommerce_image', 'background', 'promotion', '护肤清洁'],
        },
        {
          path: join(userDataPath, 'artifacts', task.id, 'background_variant_2.png'),
          tags: ['ecommerce_image', 'background', 'promotion', '护肤清洁'],
        },
        {
          path: join(userDataPath, 'artifacts', task.id, 'final_1.png'),
          tags: ['ecommerce_image', 'final', 'promotion', '护肤清洁'],
        },
        {
          path: join(userDataPath, 'artifacts', task.id, 'final_2.png'),
          tags: ['ecommerce_image', 'final', 'promotion', '护肤清洁'],
        },
      ]),
    );
    const renderPlan = JSON.parse(
      await readFile(join(userDataPath, 'artifacts', task.id, 'render_plan.json'), 'utf8'),
    ) as RenderPlanFixture;
    expect(renderPlan).toMatchObject({
      headline: '深层洁净不紧绷',
      subHeadline: '氨基酸洗面奶 通勤必备',
      badges: ['快来抖音购物', '温和清洁', '细腻泡沫'],
      emphasizedKeywords: ['洗面奶'],
      colorStrategy: '左上角取深蓝，右下角取深棕。',
    });
    expect(renderPlan.layoutConstraints).toContain('中文文字必须笔画完整、字形稳定、短语连续，不得拆字、漏字或改写。');
    expect(renderPlan.items).toHaveLength(2);
    expect(renderPlan.items[0]).toMatchObject({
      variantIndex: 1,
      sourceBackgroundPath: join(userDataPath, 'artifacts', task.id, 'background_variant_1.png'),
      scene: '清晨浴室台面',
      style: 'promotion',
    });
    expect(renderPlan.items[0]?.forbiddenRegions).toContain('原图疑似噪声区域：右上角促销贴纸');
    expect(renderPlan.items[0]?.renderConstraints).toContain('强调关键词：洗面奶');
    const finals = JSON.parse(
      await readFile(join(userDataPath, 'artifacts', task.id, 'finals.json'), 'utf8'),
    ) as FinalsFixture;
    expect(finals.finals).toHaveLength(2);
    expect(finals.finals[0]).toMatchObject({
      index: 1,
      status: 'success',
      path: join(userDataPath, 'artifacts', task.id, 'final_1.png'),
      sourceBackgroundPath: join(userDataPath, 'artifacts', task.id, 'background_variant_1.png'),
      headline: '深层洁净不紧绷',
      subHeadline: '氨基酸洗面奶 通勤必备',
      badges: ['快来抖音购物', '温和清洁', '细腻泡沫'],
      emphasizedKeywords: ['洗面奶'],
      riskNotes: ['不写绝对化功效。'],
      scene: '清晨浴室台面',
      style: 'promotion',
    });
    expect(finals.finals[0]?.prompt).toContain('渲染计划');
    expect(finals.finals[0]?.qualityNotes).toEqual([
      '已按 render_plan.json 的布局约束、禁区和可读性规则生成。',
      '文案渲染基于背景变体 index=1，场景：清晨浴室台面',
    ]);
    expect(finals.finals[0]?.renderPlan).toEqual(renderPlan.items[0]);
  });

  it('falls back to noun keywords when the model returns an empty keywords array', async () => {
    const userDataPath = mkdtempSync(join(tmpdir(), 'volcengine-ads-'));
    const productImagePath = join(userDataPath, 'product.png');
    writeFileSync(productImagePath, 'product-image');
    const repository = new MemoryTaskRepository();
    const task = repository.createTask({
      request: {
        type: 'ecommerce_image',
        input: {
          productImagePath,
          productName: '氨基酸洗面奶',
          sellingPoints: '温和清洁，通勤可用',
          variantCount: 1,
          style: 'clean',
        },
      },
      stepNames: ecommerceImagePipeline.steps.map((step) => step.name),
    });
    const modelClient = new EcommerceImageMockModelClient([]);

    await runPipeline({
      task,
      pipeline: ecommerceImagePipeline,
      repository,
      modelClient,
      workflowPrompts: {},
      userDataPath,
      emitProgress: () => undefined,
    });

    const renderPlan = JSON.parse(
      await readFile(join(userDataPath, 'artifacts', task.id, 'render_plan.json'), 'utf8'),
    ) as RenderPlanFixture;
    expect(renderPlan.emphasizedKeywords).toEqual([
      '氨基酸洗面奶',
      '护肤清洁',
      '温和清洁',
      '泡沫细腻',
      '通勤可用',
    ]);
    expect(renderPlan.items[0]?.renderConstraints).toContain(
      '强调关键词：氨基酸洗面奶、护肤清洁、温和清洁、泡沫细腻、通勤可用',
    );
  });
});
