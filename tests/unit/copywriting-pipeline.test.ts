import { mkdtempSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { SqliteTaskRepository } from '../../src/main/db/index.js';
import type {
  AudioResult,
  ChatMessage,
  ChatOptions,
  ImageResult,
  ModelClient,
  TranscriptResult,
  VideoResult,
  WebSearchRequest,
  WebSearchResult,
} from '../../src/main/model-client/index.js';
import { copywritingPipeline } from '../../src/main/pipelines/copywriting/index.js';
import { runPipeline } from '../../src/main/pipelines/runner.js';
import { MONEY_MAKING_MATERIAL_RULES_PROMPT } from '../../src/shared/workflows.js';

class CopywritingMockModelClient implements ModelClient {
  private chatIndex = 0;
  readonly chatOptions: Array<ChatOptions | undefined> = [];
  readonly chatMessages: ChatMessage[][] = [];
  readonly webSearchRequests: WebSearchRequest[] = [];

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

  async chat(messages: ChatMessage[], opts?: ChatOptions): Promise<string> {
    this.chatMessages.push(messages);
    this.chatOptions.push(opts);
    const responses = [
      JSON.stringify({
        industryFit: 'high',
        templateName: '电商通勤场景短视频脚本模板',
        optimizedFormula: '早高峰痛点 + 商品卖点 + 场景证据 + 下单 CTA',
        mustUseModules: ['商品特写', '使用场景', '卖点对比'],
        optionalModules: ['促销权益'],
        angleLibrary: ['早高峰痛点', '办公室场景', '轻量对比'],
        writingRules: ['首秒先抛通勤痛点', '卖点必须可被画面验证'],
        complianceRules: ['不夸大具体保温小时数', '不承诺医疗或功效'],
        riskNotes: ['避免绝对化表达'],
        agentPlan: ['拆解通勤痛点', '强调防漏和保温', '输出短视频脚本'],
      }),
      JSON.stringify({
        product: {
          name: '轻量保温杯',
          category: '电商日用品',
          coreValue: '通勤路上也能随时喝到温热饮品',
        },
        audience: {
          segment: '一线城市通勤白领',
          painPoints: ['早高峰没时间买热饮', '普通杯子容易漏水'],
          desires: ['轻便', '保温', '好清洗'],
        },
        offer: {
          sellingPoints: ['轻量杯身', '长效保温', '防漏设计'],
          proofPoints: ['办公室和地铁通勤场景'],
          ctaGoal: '点击购买',
        },
        constraints: {
          platform: '抖音信息流',
          format: 'short_video',
          durationSec: 30,
          mustInclude: ['通勤场景'],
          avoid: ['夸大保温时长'],
          riskNotes: ['不承诺医疗或功效'],
        },
        creativeAngles: ['早高峰痛点', '办公室场景', '轻量对比'],
      }),
      JSON.stringify({
        positioning: '通勤白领的轻量热饮解决方案',
        audienceInsight: '用户想减少早晨决策成本，同时避免杯子漏水带来的尴尬。',
        hookStrategies: [
          {
            name: '早高峰痛点',
            firstSecond: '你是不是也在地铁口错过热咖啡？',
            whyItWorks: '直接命中高频场景',
          },
        ],
        conversionPath: ['痛点停留', '功能兴趣', '场景信任', '点击行动'],
        tone: '轻快、真实、生活化',
        proofStrategy: ['通勤包防漏展示', '办公室开杯热气'],
        scriptBlueprint: {
          opening: '痛点设问',
          middle: '场景展示卖点',
          proof: '防漏和保温可视化',
          cta: '点击购买',
        },
        qualityChecklist: ['首秒明确', '卖点可证明'],
      }),
      JSON.stringify({
        scripts: [
          {
            index: 1,
            title: '错过热咖啡以后',
            script:
              '早高峰不用再绕路买咖啡，把轻量保温杯放进通勤包，到办公室打开还是温热一口。',
          },
        ],
        summary: '优先测试早高峰痛点切入。',
      }),
    ];
    const response = responses[this.chatIndex];
    this.chatIndex += 1;
    if (response === undefined) {
      throw new Error('unexpected chat call');
    }
    return response;
  }

  async webSearch(req: WebSearchRequest): Promise<WebSearchResult> {
    this.webSearchRequests.push(req);
    return {
      text: JSON.stringify({
        summary: '近期通勤好物内容强调轻量、少负担和办公室续航场景。',
        productInsights: ['轻量杯身适合通勤包', '防漏结构能解决包内洒漏顾虑'],
        trendInsights: ['通勤效率类内容适合用真实早高峰场景切入'],
        memeInsights: ['可以轻度借用“早八人续命”语境'],
        riskNotes: ['不要承诺未经验证的具体保温小时数'],
      }),
      citations: [
        {
          title: '通勤好物趋势',
          url: 'https://example.com/commute-cup',
          snippet: '通勤场景内容关注轻量和防漏。',
        },
      ],
    };
  }

  async vision(): Promise<string> {
    throw new Error('vision should not be called');
  }

  async visionVideo(): Promise<string> {
    throw new Error('visionVideo should not be called');
  }
}

describe('copywritingPipeline', () => {
  it('matches an industry template before optimizing, then writes scripts and registers a script asset', async () => {
    const userDataPath = mkdtempSync(join(tmpdir(), 'copywriting-pipeline-'));
    const repository = new SqliteTaskRepository(join(userDataPath, 'tasks.db'));
    const modelClient = new CopywritingMockModelClient();
    const task = repository.createTask({
      request: {
        type: 'copywriting',
        input: {
          industry: 'auto',
          requirement: '为一款通勤保温杯写短视频广告脚本，突出轻量、保温和办公室使用场景。',
          productName: '轻量保温杯',
          audience: '一线城市通勤白领',
          platform: '抖音信息流',
          format: 'short_video',
          variantCount: 1,
          durationSec: 30,
          enableWebSearch: true,
        },
      },
      stepNames: copywritingPipeline.steps.map((step) => step.name),
    });

    await runPipeline({
      task,
      pipeline: copywritingPipeline,
      repository,
      modelClient,
      workflowPrompts: {},
      userDataPath,
      emitProgress: () => undefined,
    });

    const completed = repository.getTask(task.id);
    expect(completed?.status).toBe('success');
    expect(completed?.steps.map((step) => step.step)).toEqual([
      'industry_router',
      'template_optimize',
      'web_research',
      'requirement_decompose',
      'strategy_analysis',
      'script_writer',
    ]);
    expect(completed?.steps.every((step) => step.status === 'success')).toBe(true);
    expect(modelClient.chatOptions).toHaveLength(4);
    expect(modelClient.webSearchRequests).toHaveLength(1);
    expect(modelClient.webSearchRequests[0]?.maxKeyword).toBe(2);
    expect(modelClient.chatOptions.every((opts) => opts?.reasoningEffort === 'high')).toBe(true);

    const scriptsMarkdownPath = join(userDataPath, 'artifacts', task.id, 'scripts.md');
    await expect(readFile(join(userDataPath, 'artifacts', task.id, 'industry.json'), 'utf8')).resolves.toContain(
      '"industry": "ecommerce"',
    );
    await expect(readFile(join(userDataPath, 'artifacts', task.id, 'template.json'), 'utf8')).resolves.toContain(
      '电商通勤场景短视频脚本模板',
    );
    await expect(readFile(join(userDataPath, 'artifacts', task.id, 'research.json'), 'utf8')).resolves.toContain(
      '早八人续命',
    );
    await expect(readFile(join(userDataPath, 'artifacts', task.id, 'scripts.json'), 'utf8')).resolves.toContain(
      '错过热咖啡以后',
    );
    await expect(readFile(scriptsMarkdownPath, 'utf8')).resolves.toContain('## 联网补充');
    await expect(readFile(scriptsMarkdownPath, 'utf8')).resolves.toContain('### 完整广告文案');
    await expect(readFile(scriptsMarkdownPath, 'utf8')).resolves.not.toContain('### 节奏 Beats');
    expect(repository.listAssets()).toEqual([
      expect.objectContaining({
        taskId: task.id,
        kind: 'script',
        path: scriptsMarkdownPath,
        tags: ['copywriting', 'ecommerce', 'short_video'],
      }),
    ]);
  });

  it('builds inferred requirement context when the user leaves requirement empty', async () => {
    const userDataPath = mkdtempSync(join(tmpdir(), 'copywriting-pipeline-inferred-'));
    const repository = new SqliteTaskRepository(join(userDataPath, 'tasks.db'));
    const modelClient = new CopywritingMockModelClient();
    const task = repository.createTask({
      request: {
        type: 'copywriting',
        input: {
          industry: 'auto',
          productName: '轻量保温杯',
          audience: '一线城市通勤白领',
          platform: '抖音信息流',
          format: 'short_video',
          variantCount: 1,
          durationSec: 30,
          enableWebSearch: true,
        },
      },
      stepNames: copywritingPipeline.steps.map((step) => step.name),
    });

    await runPipeline({
      task,
      pipeline: copywritingPipeline,
      repository,
      modelClient,
      workflowPrompts: {},
      userDataPath,
      emitProgress: () => undefined,
    });

    const webSearchQuery = modelClient.webSearchRequests[0]?.query ?? '';
    const templatePrompt =
      modelClient.chatMessages[0]?.find((message) => message.role === 'user')?.content ?? '';
    const analysisPrompt =
      modelClient.chatMessages[2]?.find((message) => message.role === 'user')?.content ?? '';

    expect(webSearchQuery).toContain('用户未填写文案需求');
    expect(templatePrompt).toContain('用户未填写文案需求');
    expect(analysisPrompt).toContain('联网补充：开启');
    expect(repository.getTask(task.id)?.status).toBe('success');
  });

  it('auto routes money making requirements to the money making template', async () => {
    const userDataPath = mkdtempSync(join(tmpdir(), 'copywriting-pipeline-money-making-'));
    const repository = new SqliteTaskRepository(join(userDataPath, 'tasks.db'));
    const modelClient = new CopywritingMockModelClient();
    const task = repository.createTask({
      request: {
        type: 'copywriting',
        input: {
          industry: 'auto',
          requirement: '为极速版内容 APP 写网赚广告脚本，突出红包金币奖励、看视频赚钱和可信用户口播。',
          productName: '极速版内容 APP',
          platform: '抖音信息流',
          format: 'short_video',
          variantCount: 1,
          durationSec: 30,
          enableWebSearch: true,
        },
      },
      stepNames: copywritingPipeline.steps.map((step) => step.name),
    });

    await runPipeline({
      task,
      pipeline: copywritingPipeline,
      repository,
      modelClient,
      workflowPrompts: {},
      userDataPath,
      emitProgress: () => undefined,
    });

    await expect(readFile(join(userDataPath, 'artifacts', task.id, 'industry.json'), 'utf8')).resolves.toContain(
      '"industry": "money_making"',
    );
    expect(JSON.stringify(modelClient.chatMessages)).toContain(MONEY_MAKING_MATERIAL_RULES_PROMPT);
    expect(repository.listAssets()).toEqual([
      expect.objectContaining({
        taskId: task.id,
        kind: 'script',
        tags: ['copywriting', 'money_making', 'short_video'],
      }),
    ]);
  });
});
