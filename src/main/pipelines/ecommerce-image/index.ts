import { AppError } from '../../errors.js';
import type { EcommerceImageInput, EcommerceImageStyle } from '../../../shared/types.js';
import { ECOMMERCE_IMAGE_STYLE_DEFINITIONS } from '../../../shared/types.js';
import {
  artifactPath,
  parseModelJson,
  readJson,
  workflowPrompt,
  writeJson,
  writeText,
} from '../helpers.js';
import type { PipelineDefinition, StepContext } from '../types.js';

interface ProductUnderstanding {
  productName: string;
  category: string;
  visualFeatures: string[];
  suspectedTextNoise: string[];
  backgroundIssues: string[];
  sellingPoints: string[];
  complianceRisks?: string[];
}

interface CopyKeyword {
  text: string;
  partOfSpeech: 'noun' | 'adjective' | 'verb' | 'other';
  emphasis: 'high' | 'medium' | 'low';
}

interface CopyPlan {
  headline: string;
  subHeadline: string;
  badges: string[];
  keywords: CopyKeyword[];
  styleHints: Array<'italic' | 'stroke' | 'border' | 'top_bottom_border' | 'background'>;
  colorStrategy: string;
  riskControl: string;
}

interface BeautifyReport {
  sourcePath: string;
  outputPath: string;
  removedElements: string[];
  preservedElements: string[];
  prompt: string;
}

interface BackgroundVariant {
  index: number;
  style: EcommerceImageStyle;
  path: string;
  prompt: string;
  scene: string;
}

interface BackgroundBundle {
  variants: BackgroundVariant[];
}

interface RenderPlanItem {
  variantIndex: number;
  sourceBackgroundPath: string;
  scene: string;
  style: EcommerceImageStyle;
  textPlacement: string;
  readabilityRules: string[];
  forbiddenRegions: string[];
  renderConstraints: string[];
}

interface RenderPlan {
  headline: string;
  subHeadline: string;
  badges: string[];
  emphasizedKeywords: string[];
  colorStrategy: string;
  layoutConstraints: string[];
  items: RenderPlanItem[];
}

interface FinalImage {
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
  style: EcommerceImageStyle;
  renderPlan: RenderPlanItem;
}

interface FinalImageBundle {
  finals: FinalImage[];
}

const MAX_BADGE_COUNT = 4;
const MAX_BADGE_LENGTH = 12;
const MAX_KEYWORD_COUNT = 6;

function styleLabel(style: EcommerceImageStyle): string {
  return ECOMMERCE_IMAGE_STYLE_DEFINITIONS.find((definition) => definition.value === style)?.label ?? style;
}

function ensureStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function uniqueNormalizedStrings(items: string[]): string[] {
  const seen = new Set<string>();
  const results: string[] = [];
  for (const item of items) {
    const normalized = normalizeText(item);
    if (normalized.length === 0 || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    results.push(normalized);
  }
  return results;
}

function normalizeBadges(badges: string[], fixedCopy?: string): string[] {
  const normalizedFixedCopy = fixedCopy === undefined ? undefined : normalizeText(fixedCopy);
  const baseBadges = uniqueNormalizedStrings(badges).map((badge) => badge.slice(0, MAX_BADGE_LENGTH));
  if (
    normalizedFixedCopy !== undefined &&
    normalizedFixedCopy.length > 0 &&
    normalizedFixedCopy.length <= MAX_BADGE_LENGTH &&
    !baseBadges.includes(normalizedFixedCopy)
  ) {
    return [normalizedFixedCopy, ...baseBadges].slice(0, MAX_BADGE_COUNT);
  }
  return baseBadges.slice(0, MAX_BADGE_COUNT);
}

function splitKeywordCandidates(text: string): string[] {
  return text
    .split(/[，,、。；;｜|/\\\n\r\t ]+/)
    .map((item) => normalizeText(item))
    .filter((item) => item.length > 0);
}

function fallbackNounKeywords(product: ProductUnderstanding, input: EcommerceImageInput): CopyKeyword[] {
  const candidates = uniqueNormalizedStrings([
    product.productName,
    product.category,
    ...product.sellingPoints,
    ...splitKeywordCandidates(input.sellingPoints ?? ''),
  ]);
  return candidates.slice(0, MAX_KEYWORD_COUNT).map((text): CopyKeyword => ({ text, partOfSpeech: 'noun', emphasis: 'high' }));
}

function normalizeKeywords(keywords: CopyKeyword[], product: ProductUnderstanding, input: EcommerceImageInput): CopyKeyword[] {
  const normalized = keywords
    .filter(
      (keyword): keyword is CopyKeyword =>
        typeof keyword.text === 'string' &&
        ['noun', 'adjective', 'verb', 'other'].includes(keyword.partOfSpeech) &&
        ['high', 'medium', 'low'].includes(keyword.emphasis),
    )
    .map((keyword) => ({ ...keyword, text: normalizeText(keyword.text) }))
    .filter((keyword) => keyword.text.length > 0);
  if (normalized.length > 0) {
    return normalized.slice(0, MAX_KEYWORD_COUNT);
  }
  return fallbackNounKeywords(product, input);
}

function headlineWithFixedCopy(headline: string, fixedCopy?: string): string {
  const normalizedFixedCopy = fixedCopy === undefined ? undefined : normalizeText(fixedCopy);
  if (normalizedFixedCopy === undefined || normalizedFixedCopy.length === 0 || headline.includes(normalizedFixedCopy)) {
    return headline;
  }
  return `${normalizedFixedCopy} ${headline}`.trim();
}

function ensureProductUnderstanding(value: ProductUnderstanding, input: EcommerceImageInput): ProductUnderstanding {
  if (!value.category || !Array.isArray(value.visualFeatures)) {
    throw new AppError('E_MODEL_API_FAILED', '商品图理解缺少品类或视觉特征');
  }
  return {
    productName: value.productName || input.productName || '未命名商品',
    category: value.category,
    visualFeatures: ensureStringArray(value.visualFeatures),
    suspectedTextNoise: ensureStringArray(value.suspectedTextNoise),
    backgroundIssues: ensureStringArray(value.backgroundIssues),
    sellingPoints: ensureStringArray(value.sellingPoints),
    ...(value.complianceRisks !== undefined ? { complianceRisks: ensureStringArray(value.complianceRisks) } : {}),
  };
}

function ensureCopyPlan(value: CopyPlan, product: ProductUnderstanding, input: EcommerceImageInput): CopyPlan {
  if (!value.headline || !value.subHeadline || !Array.isArray(value.keywords)) {
    throw new AppError('E_MODEL_API_FAILED', '电商图片文案缺少标题、副标题或关键词');
  }
  const normalizedBadges = normalizeBadges(ensureStringArray(value.badges), input.fixedCopy);
  const headline = normalizedBadges.includes(normalizeText(input.fixedCopy ?? ''))
    ? normalizeText(value.headline)
    : headlineWithFixedCopy(normalizeText(value.headline), input.fixedCopy);
  return {
    headline,
    subHeadline: normalizeText(value.subHeadline),
    badges: normalizedBadges,
    keywords: normalizeKeywords(value.keywords, product, input),
    styleHints: Array.isArray(value.styleHints) ? value.styleHints : [],
    colorStrategy: value.colorStrategy || '分析背景左上角和右下角，选择同色系深色作为两行文字主色。',
    riskControl: value.riskControl || '不写绝对化功效、虚假价格和无法证明的承诺。',
  };
}

function listLines(items: string[]): string {
  return items.length > 0 ? items.map((item) => `- ${item}`).join('\n') : '- 未识别';
}

function copyPlanToMarkdown(plan: CopyPlan): string {
  return [
    `# ${plan.headline}`,
    '',
    `副标题：${plan.subHeadline}`,
    '',
    '## 徽标',
    listLines(plan.badges),
    '',
    '## 关键词',
    plan.keywords
      .map((keyword) => `- ${keyword.text}（${keyword.partOfSpeech} / ${keyword.emphasis}）`)
      .join('\n'),
    '',
    '## 样式',
    listLines(plan.styleHints),
    '',
    `配色策略：${plan.colorStrategy}`,
    '',
    `风险控制：${plan.riskControl}`,
  ].join('\n');
}

function backgroundScene(input: EcommerceImageInput, product: ProductUnderstanding, index: number): string {
  if (input.scenePrompt !== undefined) {
    return input.scenePrompt;
  }
  const styleScenes: Record<EcommerceImageStyle, string[]> = {
    clean: ['干净渐变棚拍背景', '轻阴影纯净电商台面', '浅色广告背景'],
    premium: ['高级暗调产品摄影场景', '金属与玻璃质感陈列台', '柔和轮廓光品牌大片背景'],
    promotion: ['信息流促销广告背景', '高对比热卖氛围背景', '权益刺激的电商活动场景'],
    lifestyle: ['真实家庭使用场景', '通勤或桌面生活方式场景', '自然光生活氛围背景'],
  };
  const options = styleScenes[input.style];
  return `${options[(index - 1) % options.length] ?? options[0]}，商品品类：${product.category}`;
}

function emphasizedKeywords(copyPlan: CopyPlan): string[] {
  const highPriority = copyPlan.keywords
    .filter((keyword) => keyword.emphasis === 'high' || keyword.partOfSpeech === 'noun')
    .map((keyword) => keyword.text);
  const fallback = copyPlan.keywords.slice(0, 3).map((keyword) => keyword.text);
  return Array.from(new Set(highPriority.length > 0 ? highPriority : fallback)).slice(0, 6);
}

function buildRenderPlan(
  input: EcommerceImageInput,
  product: ProductUnderstanding,
  copyPlan: CopyPlan,
  backgrounds: BackgroundBundle,
): RenderPlan {
  const keywords = emphasizedKeywords(copyPlan);
  const layoutConstraints = [
    '不遮挡商品主体、包装核心识别、品牌安全元素和重要阴影。',
    '主标题优先放置在背景留白区域，副标题与徽标保持清晰层级。',
    '中文文字必须笔画完整、字形稳定、短语连续，不得拆字、漏字或改写。',
  ];
  const readabilityRules = [
    '文字与背景保持高对比，必要时使用描边、半透明衬底或上下边框。',
    '高优先级名词关键词放大，形容词可使用描边或填充/边缘色互换。',
    '同一变体内标题、副标题、徽标的颜色和字重保持统一广告风格。',
  ];
  const forbiddenRegions = [
    '商品主体中心区域',
    '商品包装文字和 logo 区域',
    '画面边缘 5% 安全出血区域',
    ...product.suspectedTextNoise.map((item) => `原图疑似噪声区域：${item}`),
  ];
  return {
    headline: copyPlan.headline,
    subHeadline: copyPlan.subHeadline,
    badges: copyPlan.badges,
    emphasizedKeywords: keywords,
    colorStrategy: copyPlan.colorStrategy,
    layoutConstraints,
    items: backgrounds.variants.map((background): RenderPlanItem => ({
      variantIndex: background.index,
      sourceBackgroundPath: background.path,
      scene: background.scene,
      style: background.style,
      textPlacement:
        background.index % 2 === 0
          ? '主标题放在画面右上或右侧留白，副标题靠近主标题下方，徽标放在底部角落。'
          : '主标题放在画面左上或左侧留白，副标题靠近主标题下方，徽标放在底部角落。',
      readabilityRules,
      forbiddenRegions,
      renderConstraints: [
        `整体风格保持${styleLabel(input.style)}。`,
        `强调关键词：${keywords.length > 0 ? keywords.join('、') : '无'}`,
        copyPlan.riskControl,
      ],
    })),
  };
}

function finalRiskNotes(product: ProductUnderstanding, copyPlan: CopyPlan): string[] {
  return [copyPlan.riskControl, ...ensureStringArray(product.complianceRisks)];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function runProductUnderstand(ctx: StepContext<EcommerceImageInput>) {
  const response = await ctx.modelClient.vision(
    [ctx.input.productImagePath],
    workflowPrompt(ctx, 'ecommerce_image.product_understand', {
      productName: ctx.input.productName ?? '未提供',
      sellingPoints: ctx.input.sellingPoints ?? '未提供',
    }),
    { temperature: 0.2, reasoningEffort: 'medium' },
  );
  const product = ensureProductUnderstanding(
    parseModelJson<ProductUnderstanding>(response, '电商商品图理解'),
    ctx.input,
  );
  return { artifactPath: await writeJson(artifactPath(ctx.artifactDir, 'product.json'), product) };
}

async function runCopyGenerate(ctx: StepContext<EcommerceImageInput>) {
  const product = await readJson<ProductUnderstanding>(artifactPath(ctx.artifactDir, 'product.json'));
  const response = await ctx.modelClient.chat(
    [
      {
        role: 'system',
        content:
          '你是电商图片包装文案策略师。先内部判断商品品类、人群、卖点词性、风险表达和版式优先级，不输出推理链；只输出 JSON。',
      },
      {
        role: 'user',
        content: workflowPrompt(ctx, 'ecommerce_image.copy_generate', {
          productJson: JSON.stringify(product),
          fixedCopy: ctx.input.fixedCopy ?? '未提供',
          sellingPoints: ctx.input.sellingPoints ?? '未提供',
          style: styleLabel(ctx.input.style),
        }),
      },
    ],
    { temperature: 0.55, reasoningEffort: 'high', jsonSchema: {} },
  );
  const copyPlan = ensureCopyPlan(parseModelJson<CopyPlan>(response, '电商图片包装文案'), product, ctx.input);
  await writeJson(artifactPath(ctx.artifactDir, 'copy.json'), copyPlan);
  return { artifactPath: await writeText(artifactPath(ctx.artifactDir, 'copy.md'), copyPlanToMarkdown(copyPlan)) };
}

async function runMainImageBeautify(ctx: StepContext<EcommerceImageInput>) {
  const product = await readJson<ProductUnderstanding>(artifactPath(ctx.artifactDir, 'product.json'));
  const outputPath = artifactPath(ctx.artifactDir, 'beautified.png');
  const prompt = workflowPrompt(ctx, 'ecommerce_image.main_image_beautify', {
    productJson: JSON.stringify(product),
    style: styleLabel(ctx.input.style),
  });
  const generated = await ctx.modelClient.generateImage({
    refImagePath: ctx.input.productImagePath,
    prompt,
    outputPath,
    size: '2K',
  });
  const report: BeautifyReport = {
    sourcePath: ctx.input.productImagePath,
    outputPath: generated.localPath,
    removedElements: [...product.suspectedTextNoise, ...product.backgroundIssues],
    preservedElements: product.visualFeatures,
    prompt,
  };
  await writeJson(artifactPath(ctx.artifactDir, 'beautify_report.json'), report);
  ctx.repository.createAsset({
    taskId: ctx.task.id,
    kind: 'image',
    path: generated.localPath,
    tags: ['ecommerce_image', 'beautified', ctx.input.style, product.category],
  });
  return { artifactPath: generated.localPath };
}

async function runBackgroundReplace(ctx: StepContext<EcommerceImageInput>) {
  const product = await readJson<ProductUnderstanding>(artifactPath(ctx.artifactDir, 'product.json'));
  const beautifiedPath = artifactPath(ctx.artifactDir, 'beautified.png');
  const variants: BackgroundVariant[] = [];
  for (let index = 1; index <= ctx.input.variantCount; index += 1) {
    const scene = backgroundScene(ctx.input, product, index);
    const outputPath = artifactPath(ctx.artifactDir, `background_variant_${index}.png`);
    const prompt = workflowPrompt(ctx, 'ecommerce_image.background_replace', {
      productJson: JSON.stringify(product),
      style: styleLabel(ctx.input.style),
      scene,
      variantIndex: index,
    });
    const generated = await ctx.modelClient.generateImage({
      refImagePath: beautifiedPath,
      prompt,
      outputPath,
      size: '2K',
    });
    variants.push({
      index,
      style: ctx.input.style,
      path: generated.localPath,
      prompt,
      scene,
    });
    ctx.repository.createAsset({
      taskId: ctx.task.id,
      kind: 'image',
      path: generated.localPath,
      tags: ['ecommerce_image', 'background', ctx.input.style, product.category],
    });
  }
  const bundle: BackgroundBundle = { variants };
  return { artifactPath: await writeJson(artifactPath(ctx.artifactDir, 'backgrounds.json'), bundle) };
}

async function runCopyRender(ctx: StepContext<EcommerceImageInput>) {
  const product = await readJson<ProductUnderstanding>(artifactPath(ctx.artifactDir, 'product.json'));
  const copyPlan = await readJson<CopyPlan>(artifactPath(ctx.artifactDir, 'copy.json'));
  const backgrounds = await readJson<BackgroundBundle>(artifactPath(ctx.artifactDir, 'backgrounds.json'));
  const renderPlan = buildRenderPlan(ctx.input, product, copyPlan, backgrounds);
  await writeJson(artifactPath(ctx.artifactDir, 'render_plan.json'), renderPlan);
  const finals: FinalImage[] = [];
  for (const background of backgrounds.variants) {
    const renderPlanItem = renderPlan.items.find((item) => item.variantIndex === background.index);
    if (renderPlanItem === undefined) {
      throw new AppError('E_MODEL_API_FAILED', `最终图渲染计划缺少变体 index=${background.index}`);
    }
    const outputPath = artifactPath(ctx.artifactDir, `final_${background.index}.png`);
    const prompt = workflowPrompt(ctx, 'ecommerce_image.copy_render', {
      productJson: JSON.stringify(product),
      copyJson: JSON.stringify(copyPlan),
      renderPlanJson: JSON.stringify({ ...renderPlan, items: [renderPlanItem] }),
      style: styleLabel(ctx.input.style),
      scene: background.scene,
      variantIndex: background.index,
    });
    let generated: { localPath: string };
    try {
      generated = await ctx.modelClient.generateImage({
        refImagePath: background.path,
        prompt,
        outputPath,
        size: '2K',
      });
    } catch (error) {
      const detail = `最终图生成失败，变体 index=${background.index}；${errorMessage(error)}`;
      if (error instanceof AppError) {
        throw new AppError(error.code, detail, { cause: error });
      }
      throw new AppError('E_MODEL_API_FAILED', detail, { cause: error });
    }
    const finalImage: FinalImage = {
      index: background.index,
      status: 'success',
      path: generated.localPath,
      sourceBackgroundPath: background.path,
      prompt,
      headline: copyPlan.headline,
      subHeadline: copyPlan.subHeadline,
      badges: copyPlan.badges,
      emphasizedKeywords: renderPlan.emphasizedKeywords,
      riskNotes: finalRiskNotes(product, copyPlan),
      qualityNotes: [
        '已按 render_plan.json 的布局约束、禁区和可读性规则生成。',
        `文案渲染基于背景变体 index=${background.index}，场景：${background.scene}`,
      ],
      scene: background.scene,
      style: background.style,
      renderPlan: renderPlanItem,
    };
    finals.push(finalImage);
    ctx.repository.createAsset({
      taskId: ctx.task.id,
      kind: 'image',
      path: generated.localPath,
      tags: ['ecommerce_image', 'final', background.style, product.category],
    });
  }
  const bundle: FinalImageBundle = { finals };
  return { artifactPath: await writeJson(artifactPath(ctx.artifactDir, 'finals.json'), bundle) };
}

export const ecommerceImagePipeline: PipelineDefinition<EcommerceImageInput> = {
  type: 'ecommerce_image',
  steps: [
    { name: 'product_understand', runStep: runProductUnderstand },
    { name: 'copy_generate', runStep: runCopyGenerate },
    { name: 'main_image_beautify', runStep: runMainImageBeautify },
    { name: 'background_replace', runStep: runBackgroundReplace },
    { name: 'copy_render', runStep: runCopyRender },
  ],
};
