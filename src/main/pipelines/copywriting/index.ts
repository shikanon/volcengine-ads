import { AppError } from '../../errors.js';
import type { CopywritingInput, NativeIndustry } from '../../../shared/types.js';
import { NATIVE_INDUSTRY_DEFINITIONS } from '../../../shared/workflows.js';
import {
  artifactPath,
  parseModelJson,
  readJson,
  workflowPrompt,
  writeJson,
  writeText,
} from '../helpers.js';
import type { WebSearchCitation } from '../../model-client/index.js';
import type { PipelineDefinition, StepContext } from '../types.js';

interface CopywritingIndustryRoute {
  industry: NativeIndustry;
  title: string;
  formula: string;
  durationRange: string;
  requiredModules: string[];
  complianceFocus: string;
  matchMode: 'manual' | 'auto';
  score: number;
  matchedKeywords: string[];
}

interface OptimizedIndustryTemplate {
  industryFit: 'high' | 'medium' | 'low';
  templateName: string;
  optimizedFormula: string;
  mustUseModules: string[];
  optionalModules?: string[];
  angleLibrary: string[];
  writingRules: string[];
  complianceRules: string[];
  riskNotes?: string[];
  agentPlan?: string[];
}

interface ResearchEnrichment {
  enabled: boolean;
  query: string;
  summary: string;
  productInsights: string[];
  trendInsights: string[];
  memeInsights: string[];
  citations: WebSearchCitation[];
  fetchedAt: number;
  riskNotes?: string[];
  warning?: string;
}

interface ResearchDraft {
  summary?: string;
  productInsights?: unknown;
  trendInsights?: unknown;
  memeInsights?: unknown;
  riskNotes?: unknown;
}

interface RequirementDecomposition {
  product: {
    name: string;
    category: string;
    coreValue: string;
  };
  audience: {
    segment: string;
    painPoints: string[];
    desires: string[];
    objections?: string[];
  };
  offer: {
    sellingPoints: string[];
    proofPoints: string[];
    ctaGoal: string;
  };
  constraints: {
    platform: string;
    format: string;
    durationSec: number;
    mustInclude?: string[];
    avoid?: string[];
    riskNotes?: string[];
  };
  creativeAngles: string[];
  templateApplications?: string[];
}

interface StrategyAnalysis {
  positioning: string;
  audienceInsight: string;
  selectedTemplateLogic?: string;
  hookStrategies: Array<{
    name: string;
    firstSecond: string;
    whyItWorks?: string;
    riskControl?: string;
  }>;
  conversionPath: string[];
  tone: string;
  proofStrategy?: string[];
  scriptBlueprint?: {
    opening?: string;
    middle?: string;
    proof?: string;
    cta?: string;
  };
  qualityChecklist?: string[];
}

interface CopywritingScript {
  index: number;
  title: string;
  angle: string;
  templateLogic?: string;
  hook: string;
  script: string;
  voiceover?: string;
  visualNotes?: string[];
  beats?: Array<{
    timeSec: number;
    text: string;
    intent?: string;
  }>;
  cta: string;
  riskControl?: string;
}

interface ScriptBundle {
  scripts: CopywritingScript[];
  summary?: string;
}

const COPYWRITING_CHAT_OPTIONS = {
  temperature: 0.55,
  reasoningEffort: 'high' as const,
};

const COPYWRITING_DEFAULT_INDUSTRY: NativeIndustry = 'ecommerce';

const COPYWRITING_INDUSTRY_KEYWORDS: Record<NativeIndustry, string[]> = {
  game: ['游戏', '手游', '玩法', '角色', '装备', '副本', '抽卡', '充值', '福利', '闯关', '传奇'],
  short_drama: ['短剧', '剧情', '追剧', '霸总', '逆袭', '复仇', '男主', '女主', '爽文', '集'],
  novel: ['小说', '网文', '书城', '阅读', '章节', '男频', '女频', '玄幻', '言情', '听书'],
  social: ['社交', '交友', '聊天', '恋爱', '陌生人', '匹配', '同城', '约会', '陪伴'],
  tool: ['工具', '软件', 'APP', 'app', 'SaaS', '效率', '办公', '剪辑', 'AI', '平台', '系统'],
  ecommerce: [
    '电商',
    '商品',
    '好物',
    '下单',
    '购买',
    '促销',
    '优惠',
    '直播间',
    '清洁',
    '保温杯',
    '保温',
    '防漏',
    '通勤',
    '杯子',
    '护肤',
    '食品',
  ],
};

const COPYWRITING_INDUSTRIES = Object.keys(NATIVE_INDUSTRY_DEFINITIONS) as NativeIndustry[];

function buildRoute(
  industry: NativeIndustry,
  matchMode: CopywritingIndustryRoute['matchMode'],
  score: number,
  matchedKeywords: string[],
): CopywritingIndustryRoute {
  const definition = NATIVE_INDUSTRY_DEFINITIONS[industry];
  return {
    industry: definition.id,
    title: definition.title,
    formula: definition.formula,
    durationRange: definition.durationRange,
    requiredModules: definition.requiredModules,
    complianceFocus: definition.complianceFocus,
    matchMode,
    score,
    matchedKeywords,
  };
}

function matchIndustryTemplate(input: CopywritingInput): CopywritingIndustryRoute {
  const requestedIndustry = input.industry ?? 'auto';
  if (requestedIndustry !== 'auto') {
    return buildRoute(requestedIndustry, 'manual', 100, []);
  }

  const text = [
    input.requirement,
    input.productName ?? '',
    input.audience ?? '',
    input.platform ?? '',
  ].join('\n');
  let bestIndustry: NativeIndustry = COPYWRITING_DEFAULT_INDUSTRY;
  let bestScore = -1;
  let bestMatches: string[] = [];

  for (const industry of COPYWRITING_INDUSTRIES) {
    const keywords = COPYWRITING_INDUSTRY_KEYWORDS[industry];
    const matchedKeywords = keywords.filter((keyword) =>
      text.toLowerCase().includes(keyword.toLowerCase()),
    );
    const score = matchedKeywords.length;
    if (score > bestScore) {
      bestIndustry = industry;
      bestScore = score;
      bestMatches = matchedKeywords;
    }
  }

  return buildRoute(bestIndustry, 'auto', Math.max(bestScore, 0), bestMatches);
}

function ensureOptimizedTemplate(value: OptimizedIndustryTemplate): OptimizedIndustryTemplate {
  if (!value.templateName || !value.optimizedFormula || !Array.isArray(value.angleLibrary)) {
    throw new AppError('E_MODEL_API_FAILED', '广告文案模板优化缺少必要字段');
  }
  if (!Array.isArray(value.mustUseModules) || !Array.isArray(value.writingRules)) {
    throw new AppError('E_MODEL_API_FAILED', '广告文案模板优化缺少模块或写作规则');
  }
  return value;
}

function ensureRequirementDecomposition(value: RequirementDecomposition): RequirementDecomposition {
  if (!value.product?.name || !value.audience?.segment || !Array.isArray(value.creativeAngles)) {
    throw new AppError('E_MODEL_API_FAILED', '广告文案需求拆解缺少必要字段');
  }
  if (!Array.isArray(value.offer?.sellingPoints) || value.offer.sellingPoints.length === 0) {
    throw new AppError('E_MODEL_API_FAILED', '广告文案需求拆解缺少卖点');
  }
  return value;
}

function ensureStrategyAnalysis(value: StrategyAnalysis): StrategyAnalysis {
  if (!value.positioning || !value.audienceInsight || !Array.isArray(value.hookStrategies)) {
    throw new AppError('E_MODEL_API_FAILED', '广告文案策略分析缺少必要字段');
  }
  if (value.hookStrategies.length === 0 || !Array.isArray(value.conversionPath)) {
    throw new AppError('E_MODEL_API_FAILED', '广告文案策略分析缺少钩子或转化路径');
  }
  return value;
}

function ensureScriptBundle(value: ScriptBundle): ScriptBundle {
  if (!Array.isArray(value.scripts) || value.scripts.length === 0) {
    throw new AppError('E_MODEL_API_FAILED', '广告文案脚本为空');
  }
  if (value.scripts.some((script) => !script.title || !script.hook || !script.script)) {
    throw new AppError('E_MODEL_API_FAILED', '广告文案脚本缺少标题、钩子或正文');
  }
  return value;
}

function listLines(items: string[] | undefined): string {
  if (!items || items.length === 0) {
    return '- 未提供';
  }
  return items.map((item) => `- ${item}`).join('\n');
}

function compactText(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function stringArray(value: unknown, limit = 8): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim())
    .slice(0, limit);
}

function normalizeResearchEnrichment(params: {
  query: string;
  text: string;
  citations: WebSearchCitation[];
}): ResearchEnrichment {
  let draft: ResearchDraft = {};
  let warning: string | undefined;
  try {
    draft = parseModelJson<ResearchDraft>(params.text, '广告文案联网补充');
  } catch {
    warning = '联网补充未返回结构化 JSON，已保留原始摘要文本。';
  }
  const productInsights = stringArray(draft.productInsights);
  const trendInsights = stringArray(draft.trendInsights);
  const memeInsights = stringArray(draft.memeInsights);
  const riskNotes = stringArray(draft.riskNotes);
  const research: ResearchEnrichment = {
    enabled: true,
    query: params.query,
    summary: optionalString(draft.summary) ?? compactText(params.text.trim(), 1600),
    productInsights,
    trendInsights,
    memeInsights,
    citations: params.citations,
    fetchedAt: Date.now(),
  };
  if (riskNotes.length > 0) {
    research.riskNotes = riskNotes;
  }
  if (warning !== undefined) {
    research.warning = warning;
  }
  return research;
}

function renderCitations(citations: WebSearchCitation[]): string {
  if (citations.length === 0) {
    return '- 未提供';
  }
  return citations
    .slice(0, 6)
    .map((citation) => {
      const label = citation.title ?? citation.url ?? '参考来源';
      return citation.url ? `- ${label}：${citation.url}` : `- ${label}`;
    })
    .join('\n');
}

function renderScriptsMarkdown(params: {
  input: CopywritingInput;
  route: CopywritingIndustryRoute;
  template: OptimizedIndustryTemplate;
  research: ResearchEnrichment;
  decomposition: RequirementDecomposition;
  analysis: StrategyAnalysis;
  bundle: ScriptBundle;
}): string {
  const { input, route, template, research, decomposition, analysis, bundle } = params;
  const scripts = bundle.scripts
    .map((script) => {
      const beats =
        script.beats && script.beats.length > 0
          ? script.beats
              .map((beat) => `- ${beat.timeSec}s：${beat.text}${beat.intent ? `（${beat.intent}）` : ''}`)
              .join('\n')
          : '- 未提供';
      return [
        `## ${script.index}. ${script.title}`,
        '',
        `**角度**：${script.angle}`,
        script.templateLogic ? `**模板使用**：${script.templateLogic}` : undefined,
        `**钩子**：${script.hook}`,
        `**CTA**：${script.cta}`,
        script.riskControl ? `**风险控制**：${script.riskControl}` : undefined,
        '',
        '### 完整脚本',
        script.script,
        '',
        script.voiceover ? ['### 口播文本', script.voiceover, ''].join('\n') : undefined,
        script.visualNotes && script.visualNotes.length > 0
          ? ['### 画面/素材建议', listLines(script.visualNotes), ''].join('\n')
          : undefined,
        '### 节奏 Beats',
        beats,
      ]
        .filter((line): line is string => line !== undefined)
        .join('\n');
    })
    .join('\n\n---\n\n');

  return [
    '# 广告文案脚本',
    '',
    `- 匹配行业模板：${route.title}（${route.matchMode === 'manual' ? '手动选择' : '自动匹配'}）`,
    `- 优化公式：${template.optimizedFormula}`,
    `- 产品：${input.productName ?? decomposition.product.name}`,
    `- 形式：${input.format}`,
    `- 平台：${input.platform ?? decomposition.constraints.platform}`,
    `- 人群：${input.audience ?? decomposition.audience.segment}`,
    `- 目标时长：${input.durationSec}s`,
    '',
    '## 需求拆解摘要',
    '',
    `**模板名称**：${template.templateName}`,
    `**核心价值**：${decomposition.product.coreValue}`,
    '',
    '**痛点**',
    listLines(decomposition.audience.painPoints),
    '',
    '**卖点**',
    listLines(decomposition.offer.sellingPoints),
    '',
    '**模板落地**',
    listLines(decomposition.templateApplications),
    '',
    '## 联网补充',
    '',
    `**状态**：${research.enabled ? '已启用' : '未启用'}`,
    research.warning ? `**提示**：${research.warning}` : undefined,
    `**摘要**：${research.summary}`,
    '',
    '**产品/品类线索**',
    listLines(research.productInsights),
    '',
    '**热点语境**',
    listLines(research.trendInsights),
    '',
    '**可用热梗表达**',
    listLines(research.memeInsights),
    '',
    '**参考来源**',
    renderCitations(research.citations),
    '',
    '## 策略判断',
    '',
    `**定位**：${analysis.positioning}`,
    `**人群洞察**：${analysis.audienceInsight}`,
    analysis.selectedTemplateLogic ? `**模板策略**：${analysis.selectedTemplateLogic}` : undefined,
    `**语气**：${analysis.tone}`,
    '',
    '## 脚本方案',
    '',
    scripts,
    '',
    bundle.summary ? ['## 投放建议', bundle.summary].join('\n\n') : undefined,
  ]
    .filter((line): line is string => line !== undefined)
    .join('\n');
}

async function runIndustryRouter(ctx: StepContext<CopywritingInput>) {
  const route = matchIndustryTemplate(ctx.input);
  return {
    artifactPath: await writeJson(artifactPath(ctx.artifactDir, 'industry.json'), route),
  };
}

async function runTemplateOptimize(ctx: StepContext<CopywritingInput>) {
  const route = await readJson<CopywritingIndustryRoute>(
    artifactPath(ctx.artifactDir, 'industry.json'),
  );
  const response = await ctx.modelClient.chat(
    [
      {
        role: 'system',
        content: '你是广告行业模板策略师，负责把行业模板优化成当前文案 Agent 的执行策略。只输出合法 JSON。',
      },
      {
        role: 'user',
        content: workflowPrompt(ctx, 'copywriting.template_optimize', {
          industryTitle: route.title,
          formula: route.formula,
          durationRange: route.durationRange,
          requiredModules: route.requiredModules.join('、'),
          complianceFocus: route.complianceFocus,
          requirement: ctx.input.requirement,
          productName: ctx.input.productName ?? '未提供',
          audience: ctx.input.audience ?? '未提供',
          platform: ctx.input.platform ?? '未提供',
          format: ctx.input.format,
          durationSec: ctx.input.durationSec,
          variantCount: ctx.input.variantCount,
        }),
      },
    ],
    COPYWRITING_CHAT_OPTIONS,
  );
  const template = ensureOptimizedTemplate(
    parseModelJson<OptimizedIndustryTemplate>(response, '广告文案模板优化'),
  );
  return {
    artifactPath: await writeJson(artifactPath(ctx.artifactDir, 'template.json'), template),
  };
}

async function runWebResearch(ctx: StepContext<CopywritingInput>) {
  const route = await readJson<CopywritingIndustryRoute>(
    artifactPath(ctx.artifactDir, 'industry.json'),
  );
  const template = await readJson<OptimizedIndustryTemplate>(
    artifactPath(ctx.artifactDir, 'template.json'),
  );
  const query = workflowPrompt(ctx, 'copywriting.web_research', {
    industryTitle: route.title,
    optimizedTemplateJson: JSON.stringify(template),
    requirement: ctx.input.requirement,
    productName: ctx.input.productName ?? '未提供',
    audience: ctx.input.audience ?? '未提供',
    platform: ctx.input.platform ?? '未提供',
    format: ctx.input.format,
  });
  if (ctx.input.enableWebSearch === false) {
    const disabledResearch: ResearchEnrichment = {
      enabled: false,
      query,
      summary: '用户未启用联网补充。',
      productInsights: [],
      trendInsights: [],
      memeInsights: [],
      citations: [],
      fetchedAt: Date.now(),
    };
    return {
      artifactPath: await writeJson(
        artifactPath(ctx.artifactDir, 'research.json'),
        disabledResearch,
      ),
    };
  }

  const result = await ctx.modelClient.webSearch({ query, maxKeyword: 2 });
  const research = normalizeResearchEnrichment({
    query,
    text: result.text,
    citations: result.citations,
  });
  return {
    artifactPath: await writeJson(artifactPath(ctx.artifactDir, 'research.json'), research),
  };
}

async function runRequirementDecompose(ctx: StepContext<CopywritingInput>) {
  const route = await readJson<CopywritingIndustryRoute>(
    artifactPath(ctx.artifactDir, 'industry.json'),
  );
  const template = await readJson<OptimizedIndustryTemplate>(
    artifactPath(ctx.artifactDir, 'template.json'),
  );
  const research = await readJson<ResearchEnrichment>(
    artifactPath(ctx.artifactDir, 'research.json'),
  );
  const response = await ctx.modelClient.chat(
    [
      {
        role: 'system',
        content: '你是资深广告策略总监，擅长把模糊需求拆成可执行的广告脚本 brief。只输出合法 JSON。',
      },
      {
        role: 'user',
        content: workflowPrompt(ctx, 'copywriting.requirement_decompose', {
          industryTemplateJson: JSON.stringify(route),
          optimizedTemplateJson: JSON.stringify(template),
          researchJson: JSON.stringify(research),
          requirement: ctx.input.requirement,
          productName: ctx.input.productName ?? '未提供',
          audience: ctx.input.audience ?? '未提供',
          platform: ctx.input.platform ?? '未提供',
          format: ctx.input.format,
          durationSec: ctx.input.durationSec,
          variantCount: ctx.input.variantCount,
        }),
      },
    ],
    COPYWRITING_CHAT_OPTIONS,
  );
  const decomposition = ensureRequirementDecomposition(
    parseModelJson<RequirementDecomposition>(response, '广告文案需求拆解'),
  );
  return {
    artifactPath: await writeJson(artifactPath(ctx.artifactDir, 'requirement.json'), decomposition),
  };
}

async function runStrategyAnalysis(ctx: StepContext<CopywritingInput>) {
  const template = await readJson<OptimizedIndustryTemplate>(
    artifactPath(ctx.artifactDir, 'template.json'),
  );
  const research = await readJson<ResearchEnrichment>(
    artifactPath(ctx.artifactDir, 'research.json'),
  );
  const decomposition = await readJson<RequirementDecomposition>(
    artifactPath(ctx.artifactDir, 'requirement.json'),
  );
  const response = await ctx.modelClient.chat(
    [
      {
        role: 'system',
        content: '你是增长广告策略专家，擅长爆款脚本结构、首秒钩子和转化路径设计。只输出合法 JSON。',
      },
      {
        role: 'user',
        content: workflowPrompt(ctx, 'copywriting.strategy_analysis', {
          requirement: ctx.input.requirement,
          optimizedTemplateJson: JSON.stringify(template),
          researchJson: JSON.stringify(research),
          decompositionJson: JSON.stringify(decomposition),
        }),
      },
    ],
    COPYWRITING_CHAT_OPTIONS,
  );
  const analysis = ensureStrategyAnalysis(
    parseModelJson<StrategyAnalysis>(response, '广告文案策略分析'),
  );
  return {
    artifactPath: await writeJson(artifactPath(ctx.artifactDir, 'analysis.json'), analysis),
  };
}

async function runScriptWriter(ctx: StepContext<CopywritingInput>) {
  const route = await readJson<CopywritingIndustryRoute>(
    artifactPath(ctx.artifactDir, 'industry.json'),
  );
  const template = await readJson<OptimizedIndustryTemplate>(
    artifactPath(ctx.artifactDir, 'template.json'),
  );
  const research = await readJson<ResearchEnrichment>(
    artifactPath(ctx.artifactDir, 'research.json'),
  );
  const decomposition = await readJson<RequirementDecomposition>(
    artifactPath(ctx.artifactDir, 'requirement.json'),
  );
  const analysis = await readJson<StrategyAnalysis>(artifactPath(ctx.artifactDir, 'analysis.json'));
  const response = await ctx.modelClient.chat(
    [
      {
        role: 'system',
        content: '你是爆款广告脚本编导，输出能直接给投放、拍摄或视频生成使用的脚本文案。只输出合法 JSON。',
      },
      {
        role: 'user',
        content: workflowPrompt(ctx, 'copywriting.script_writer', {
          optimizedTemplateJson: JSON.stringify(template),
          researchJson: JSON.stringify(research),
          decompositionJson: JSON.stringify(decomposition),
          analysisJson: JSON.stringify(analysis),
          variantCount: ctx.input.variantCount,
          durationSec: ctx.input.durationSec,
          format: ctx.input.format,
        }),
      },
    ],
    COPYWRITING_CHAT_OPTIONS,
  );
  const bundle = ensureScriptBundle(parseModelJson<ScriptBundle>(response, '广告文案脚本生成'));
  await writeJson(artifactPath(ctx.artifactDir, 'scripts.json'), bundle);
  const markdownPath = await writeText(
    artifactPath(ctx.artifactDir, 'scripts.md'),
    renderScriptsMarkdown({
      input: ctx.input,
      route,
      template,
      research,
      decomposition,
      analysis,
      bundle,
    }),
  );
  ctx.repository.createAsset({
    taskId: ctx.task.id,
    kind: 'script',
    path: markdownPath,
    tags: ['copywriting', route.industry, ctx.input.format],
  });
  return { artifactPath: markdownPath };
}

export const copywritingPipeline: PipelineDefinition<CopywritingInput> = {
  type: 'copywriting',
  steps: [
    { name: 'industry_router', runStep: runIndustryRouter },
    { name: 'template_optimize', runStep: runTemplateOptimize },
    { name: 'web_research', runStep: runWebResearch },
    { name: 'requirement_decompose', runStep: runRequirementDecompose },
    { name: 'strategy_analysis', runStep: runStrategyAnalysis },
    { name: 'script_writer', runStep: runScriptWriter },
  ],
};
