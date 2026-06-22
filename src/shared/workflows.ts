import type {
  AdVideoScoringCategory,
  ExplosionFissionConfig,
  ExplosionFissionMode,
  FissionIndustry,
  FissionSlotKey,
  NativeIndustry,
  TaskType,
} from './types.js';

export const WORKFLOW_PROMPT_TEMPLATE_VERSION = '2026-06-23-ecommerce-image-render-plan-v1';

export interface NativeIndustryDefinition {
  id: NativeIndustry;
  title: string;
  formula: string;
  durationRange: string;
  requiredModules: string[];
  complianceFocus: string;
}

export const MONEY_MAKING_MATERIAL_RULES_PROMPT =
  '网赚类素材规律：图片单卖点由背景底图、logo/警示语、网赚灵感原子透明图层组成，常见红包、宝箱、金蛋、金币、礼物盒等红黄奖励视觉；奖励信息优先用金币、积分、任务权益等非现金表达，不写具体金额。图片大字报要用短卖点、强对比字块和奖励原子建立首秒停留，规则信息优先用图标化短标签或无文字图标表达积分用途、参与路径和规则页入口，避免密集小字、手机界面小字和功能按钮文字导致乱码；图片多卖点是在非网赚起量素材上叠加任务卡片、红包/金币奖励贴片和可信福利提醒，必须避免仿系统通知、伪官方提醒、真实品牌冒用和明显错字。视频单卖点包含大字报滚屏、风景/解压/城市背景、红包掉落/翻动/加载等利益创意；视频多卖点是在老歌等下沉 UGC 上叠加红包、金币特效；真人类通过权威口播、感性口播、多人采访、情景剧建立“可信赚钱”感。合规底线：只表达任务奖励、福利提醒和可参与感，必要时提示规则页查看；禁止保证收益、稳赚、日入、秒到账、虚构提现截图、夸大赚钱效果和误导下载。';

export const NATIVE_INDUSTRY_DEFINITIONS: Record<NativeIndustry, NativeIndustryDefinition> = {
  game: {
    id: 'game',
    title: '游戏',
    formula: '钩子 + 爽点 + 成长 + 福利 + CTA',
    durationRange: '15-30s',
    requiredModules: ['玩法录屏占位', '角色立绘', '福利前置'],
    complianceFocus: '反外挂、价值观、第三方 IP 授权',
  },
  short_drama: {
    id: 'short_drama',
    title: '短剧',
    formula: '黄金 3s 高光 + 2-3min 小闭环 + 1min 悬念钩',
    durationRange: '60s-5min',
    requiredModules: ['调色情绪映射', '花字', '卡点剪辑'],
    complianceFocus: '暴力分级、版权',
  },
  novel: {
    id: 'novel',
    title: '小说',
    formula: '15s AI 钩子前贴 + 解压/滚屏拼接',
    durationRange: '15-60s',
    requiredModules: ['人物参考图固化', '六段式信息流脚本'],
    complianceFocus: 'AIGC 命名规范',
  },
  social: {
    id: 'social',
    title: '社交',
    formula: '起承转合四段式',
    durationRange: '15-30s',
    requiredModules: ['不露脸自拍', '聊天记录截图'],
    complianceFocus: '不良暗示词库 + 不实宣传词库',
  },
  tool: {
    id: 'tool',
    title: '工具',
    formula: '痛点 + 真人口播 + UI 演示 + CTA',
    durationRange: '15-30s',
    requiredModules: ['数字人口播', 'UI 占位', '创意空镜'],
    complianceFocus: '真实承诺、无虚假宣传',
  },
  ecommerce: {
    id: 'ecommerce',
    title: '电商',
    formula: '场景痛点 + 商品卖点 + 证据背书 + 权益刺激 + CTA',
    durationRange: '15-30s',
    requiredModules: ['商品特写', '使用场景', '卖点对比', '促销权益'],
    complianceFocus: '价格真实性、促销规则、功效承诺、品牌授权',
  },
  money_making: {
    id: 'money_making',
    title: '网赚',
    formula: '可信赚钱钩子 + 网赚灵感原子 + 奖励视觉/UGC 叠加 + 信任背书 + CTA',
    durationRange: '15-30s',
    requiredModules: [
      '网赚灵感原子',
      '红包/金币/宝箱奖励视觉',
      '大字报或利益创意',
      'UGC奖励叠加或真人信任套路',
    ],
    complianceFocus: `收益表达必须克制可信，禁止保证收益、夸大提现、虚构到账、诱导误导下载；${MONEY_MAKING_MATERIAL_RULES_PROMPT}`,
  },
};

export type FissionSlotAssetKind = 'video' | 'audio';

export interface FissionSlotDefinition {
  key: FissionSlotKey;
  label: string;
  description: string;
  assetKind: FissionSlotAssetKind;
  required: boolean;
}

export interface FissionModeDefinition {
  industry: FissionIndustry;
  mode: ExplosionFissionMode;
  title: string;
  description: string;
  formula: string;
  slots: FissionSlotDefinition[];
}

export interface FissionCombinationFactor {
  slotKey: FissionSlotKey;
  label: string;
  count: number;
}

export interface FissionCombinationEstimate {
  factors: FissionCombinationFactor[];
  total: number;
  formula: string;
  sampleCount: number;
}

export interface FissionValidationResult {
  valid: boolean;
  errors: string[];
}

export interface FissionSampledSlot {
  slotKey: FissionSlotKey;
  label: string;
  assetPath: string;
  assetIndex: number;
}

export interface FissionSampledCombination {
  index: number;
  combinationIndex: number;
  slots: FissionSampledSlot[];
}

export const FISSION_INDUSTRY_OPTIONS: readonly FissionIndustry[] = ['ecommerce', 'short_drama'];

export const FISSION_SLOT_DEFINITIONS: Record<FissionSlotKey, FissionSlotDefinition> = {
  pain_pretrailer: {
    key: 'pain_pretrailer',
    label: '3秒痛点前贴',
    description: '开场 3 秒放大用户痛点或强钩子。',
    assetKind: 'video',
    required: true,
  },
  product_highlight: {
    key: 'product_highlight',
    label: '产品高光',
    description: '展示商品核心卖点、使用效果或关键证明的高光片段。',
    assetKind: 'video',
    required: true,
  },
  benefit_ending: {
    key: 'benefit_ending',
    label: '利益点结尾',
    description: '承接商品高光后的权益、促销或转化收口。',
    assetKind: 'video',
    required: true,
  },
  benefit_point: {
    key: 'benefit_point',
    label: '利益点',
    description: '可替换的优惠、权益、功效或卖点表达。',
    assetKind: 'video',
    required: true,
  },
  action_guidance: {
    key: 'action_guidance',
    label: '行动引导',
    description: '引导点击、下单、领取权益或继续观看的 CTA 片段。',
    assetKind: 'video',
    required: true,
  },
  digital_human: {
    key: 'digital_human',
    label: 'AI数字人口播',
    description: '实拍数字人口播或可合成的口播片段。',
    assetKind: 'video',
    required: true,
  },
  realshot_ambience: {
    key: 'realshot_ambience',
    label: '实拍空镜',
    description: '承接口播的真实环境、使用场景或氛围空镜。',
    assetKind: 'video',
    required: true,
  },
  product_close_up: {
    key: 'product_close_up',
    label: '产品特写',
    description: '商品包装、质地、细节或使用状态特写。',
    assetKind: 'video',
    required: true,
  },
  fixed_intro: {
    key: 'fixed_intro',
    label: '固定开头',
    description: '顺序混剪中保持不变的开场片段。',
    assetKind: 'video',
    required: true,
  },
  remix_clip: {
    key: 'remix_clip',
    label: '中段混剪',
    description: '顺序混剪中可打乱或替换的中间片段。',
    assetKind: 'video',
    required: true,
  },
  fixed_outro: {
    key: 'fixed_outro',
    label: '固定结尾',
    description: '顺序混剪中保持不变的收口片段。',
    assetKind: 'video',
    required: true,
  },
  highlight_1: {
    key: 'highlight_1',
    label: '高光1',
    description: '短剧第一段剧情冲突或爽点高光。',
    assetKind: 'video',
    required: true,
  },
  highlight_2: {
    key: 'highlight_2',
    label: '高光2',
    description: '短剧第二段剧情推进或反转高光。',
    assetKind: 'video',
    required: true,
  },
  highlight_3: {
    key: 'highlight_3',
    label: '高光3',
    description: '短剧第三段情绪峰值或悬念高光。',
    assetKind: 'video',
    required: true,
  },
  pretrailer: {
    key: 'pretrailer',
    label: '3秒前贴',
    description: '短剧正片前的 3 秒前贴钩子。',
    assetKind: 'video',
    required: true,
  },
  commentary: {
    key: 'commentary',
    label: '解说',
    description: '解说二创中的解说口播或带解说视频片段。',
    assetKind: 'video',
    required: true,
  },
  original_highlight: {
    key: 'original_highlight',
    label: '原片高光',
    description: '解说二创复用的原片剧情高光。',
    assetKind: 'video',
    required: true,
  },
  beat_clip_1: {
    key: 'beat_clip_1',
    label: '卡点1',
    description: '卡点混剪第一段节奏素材。',
    assetKind: 'video',
    required: true,
  },
  beat_clip_2: {
    key: 'beat_clip_2',
    label: '卡点2',
    description: '卡点混剪第二段节奏素材。',
    assetKind: 'video',
    required: true,
  },
  beat_clip_3: {
    key: 'beat_clip_3',
    label: '卡点3',
    description: '卡点混剪第三段节奏素材。',
    assetKind: 'video',
    required: true,
  },
  bgm: {
    key: 'bgm',
    label: 'BGM',
    description: '用于拼接或混合的背景音乐。',
    assetKind: 'audio',
    required: true,
  },
};

export const FISSION_SLOT_KEYS = Object.keys(FISSION_SLOT_DEFINITIONS) as FissionSlotKey[];

function defineFissionMode(
  industry: FissionIndustry,
  mode: ExplosionFissionMode,
  title: string,
  description: string,
  slotKeys: FissionSlotKey[],
): FissionModeDefinition {
  const slots = slotKeys.map((slotKey) => FISSION_SLOT_DEFINITIONS[slotKey]);
  return {
    industry,
    mode,
    title,
    description,
    formula: slots.map((slot) => slot.label).join(' + '),
    slots,
  };
}

export const FISSION_MODE_DEFINITIONS: Record<ExplosionFissionMode, FissionModeDefinition> = {
  pain_pretrailer: defineFissionMode(
    'ecommerce',
    'pain_pretrailer',
    '痛点前贴裂变',
    '3秒痛点前贴 + 产品高光 + 利益点结尾 + BGM',
    ['pain_pretrailer', 'product_highlight', 'benefit_ending', 'bgm'],
  ),
  benefit_point: defineFissionMode(
    'ecommerce',
    'benefit_point',
    '利益点裂变',
    '产品高光 + 利益点A/B/C + 行动引导 + BGM',
    ['product_highlight', 'benefit_point', 'action_guidance', 'bgm'],
  ),
  realshot_digital_human: defineFissionMode(
    'ecommerce',
    'realshot_digital_human',
    '实拍数字人裂变',
    'AI数字人口播 + 实拍空镜 + 产品特写 + BGM',
    ['digital_human', 'realshot_ambience', 'product_close_up', 'bgm'],
  ),
  sequence_remix: defineFissionMode(
    'ecommerce',
    'sequence_remix',
    '顺序混剪裂变',
    '固定首尾 + 中间打乱 + BGM',
    ['fixed_intro', 'remix_clip', 'fixed_outro', 'bgm'],
  ),
  trend_remix: defineFissionMode(
    'short_drama',
    'trend_remix',
    '顺势二创',
    '高光1 + 高光2 + 高光3',
    ['highlight_1', 'highlight_2', 'highlight_3'],
  ),
  pretrailer_remix: defineFissionMode(
    'short_drama',
    'pretrailer_remix',
    '前贴二创',
    '3秒前贴 + 高光1 + 高光2 + BGM',
    ['pretrailer', 'highlight_1', 'highlight_2', 'bgm'],
  ),
  commentary_remix: defineFissionMode(
    'short_drama',
    'commentary_remix',
    '解说二创',
    '解说 + 原片高光 + BGM',
    ['commentary', 'original_highlight', 'bgm'],
  ),
  beat_cut: defineFissionMode(
    'short_drama',
    'beat_cut',
    '卡点混剪',
    '卡点1 + 卡点2 + 卡点3 + BGM',
    ['beat_clip_1', 'beat_clip_2', 'beat_clip_3', 'bgm'],
  ),
};

export const FISSION_MODE_OPTIONS: Record<FissionIndustry, FissionModeDefinition[]> = {
  ecommerce: [
    FISSION_MODE_DEFINITIONS.pain_pretrailer,
    FISSION_MODE_DEFINITIONS.benefit_point,
    FISSION_MODE_DEFINITIONS.realshot_digital_human,
    FISSION_MODE_DEFINITIONS.sequence_remix,
  ],
  short_drama: [
    FISSION_MODE_DEFINITIONS.trend_remix,
    FISSION_MODE_DEFINITIONS.pretrailer_remix,
    FISSION_MODE_DEFINITIONS.commentary_remix,
    FISSION_MODE_DEFINITIONS.beat_cut,
  ],
};

export const FISSION_MODE_VALUES = Object.keys(
  FISSION_MODE_DEFINITIONS,
) as ExplosionFissionMode[];

export function getFissionModeDefinition(
  industry: FissionIndustry,
  mode: ExplosionFissionMode,
): FissionModeDefinition | undefined {
  const definition = FISSION_MODE_DEFINITIONS[mode];
  return definition.industry === industry ? definition : undefined;
}

function toSafeCount(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.trunc(value));
}

function toSafeVariantCount(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.trunc(value));
}

function normalizeAssetPaths(paths: string[]): string[] {
  return paths.map((path) => path.trim()).filter((path) => path.length > 0);
}

export function getFissionSlotAssetPaths(
  config: ExplosionFissionConfig,
  slotKey: FissionSlotKey,
): string[] {
  const slotPaths = normalizeAssetPaths(config.slotAssetPaths?.[slotKey] ?? []);
  if (slotKey === 'bgm') {
    return [...slotPaths, ...normalizeAssetPaths(config.bgmPaths ?? [])];
  }
  return slotPaths;
}

export function getFissionSlotAssetCounts(
  config: ExplosionFissionConfig,
): Partial<Record<FissionSlotKey, number>> {
  const definition = getFissionModeDefinition(config.industry, config.mode);
  if (!definition) {
    return {};
  }
  return Object.fromEntries(
    definition.slots.map((slot) => [slot.key, getFissionSlotAssetPaths(config, slot.key).length]),
  ) as Partial<Record<FissionSlotKey, number>>;
}

export function estimateFissionCombinations(
  industry: FissionIndustry,
  mode: ExplosionFissionMode,
  slotCounts: Partial<Record<FissionSlotKey, number>>,
  variantCount = Number.MAX_SAFE_INTEGER,
): FissionCombinationEstimate {
  const definition = getFissionModeDefinition(industry, mode);
  if (!definition) {
    return { factors: [], total: 0, formula: '0 = 0', sampleCount: 0 };
  }
  const factors = definition.slots.map((slot) => ({
    slotKey: slot.key,
    label: slot.label,
    count: toSafeCount(slotCounts[slot.key]),
  }));
  const total = factors.reduce((current, factor) => current * factor.count, 1);
  const sampleCount = Math.min(toSafeVariantCount(variantCount), total);
  const formula = `${factors.map((factor) => String(factor.count)).join(' × ')} = ${total}`;
  return { factors, total, formula, sampleCount };
}

export function validateFissionCombinationInputs(
  config: ExplosionFissionConfig,
  variantCount: number,
): FissionValidationResult {
  const definition = getFissionModeDefinition(config.industry, config.mode);
  if (!definition) {
    return { valid: false, errors: ['行业裂变模式与所选行业不匹配'] };
  }
  const errors: string[] = [];
  for (const slot of definition.slots) {
    if (slot.required && getFissionSlotAssetPaths(config, slot.key).length === 0) {
      errors.push(`缺少必填槽位素材：${slot.label}`);
    }
  }
  const estimate = estimateFissionCombinations(
    config.industry,
    config.mode,
    getFissionSlotAssetCounts(config),
    variantCount,
  );
  if (estimate.total > 0 && estimate.sampleCount === 0) {
    errors.push('裂变生成数量必须至少为 1');
  }
  return { valid: errors.length === 0, errors };
}

function decodeCombinationIndex(index: number, counts: number[]): number[] {
  let remaining = index;
  return counts.map((count) => {
    const assetIndex = remaining % count;
    remaining = Math.floor(remaining / count);
    return assetIndex;
  });
}

export function sampleFissionCombinations(
  config: ExplosionFissionConfig,
  variantCount: number,
): FissionSampledCombination[] {
  const definition = getFissionModeDefinition(config.industry, config.mode);
  if (!definition) {
    return [];
  }
  const validation = validateFissionCombinationInputs(config, variantCount);
  if (!validation.valid) {
    return [];
  }
  const assetsBySlot = definition.slots.map((slot) => ({
    slot,
    paths: getFissionSlotAssetPaths(config, slot.key),
  }));
  const counts = assetsBySlot.map((entry) => entry.paths.length);
  const estimate = estimateFissionCombinations(
    config.industry,
    config.mode,
    getFissionSlotAssetCounts(config),
    variantCount,
  );
  if (estimate.sampleCount === 0) {
    return [];
  }
  return Array.from({ length: estimate.sampleCount }, (_, index) => {
    const combinationIndex = Math.floor((index * estimate.total) / estimate.sampleCount);
    const assetIndexes = decodeCombinationIndex(combinationIndex, counts);
    const slots = assetsBySlot.map((entry, slotIndex) => {
      const assetIndex = assetIndexes[slotIndex] ?? 0;
      return {
        slotKey: entry.slot.key,
        label: entry.slot.label,
        assetPath: entry.paths[assetIndex] ?? '',
        assetIndex,
      };
    });
    return { index: index + 1, combinationIndex, slots };
  });
}

export const VIDEO_COMPOSITION_PROMPT =
  '构图层面：包含构图形式、空间层次、视觉秩序、视觉重心、疏密虚实对比、视线引导与叙事氛围。';

export const SEEDANCE_DIRECTOR_PROMPT =
  'Seedance 导演式描述：优先写清视觉锚点、行为状态、局部调性和广告目的；低价值摄影参数只在用户明确要求时保留，能表达观众感受的镜头语言要转译为情绪、节奏和叙事体验。';

export const AD_CREATIVE_STRUCTURE_PROMPT =
  '广告创意结构：首秒出现可视化钩子，随后给出痛点或爽点、产品/剧情/服务的可感知卖点、可信证据或场景背书，结尾用自然 CTA 收束；每条变体必须有不同切入角度。';

export const AD_MATERIAL_QUALITY_PROMPT =
  '广告素材质量：画面主体清晰稳定，产品或剧情识别度高，无水印、无错别字、无虚假承诺、无夸大功效、无过期活动信息，避免平台审核高风险表达。';

export const VIDEO_TEXT_STICKER_PROMPT =
  '视频生成阶段禁止生成文字贴纸、花字、字幕、角标、价格牌、按钮文案或任何可读文字；这些文字贴纸应由图片模型单独生成透明贴纸素材，并在合成阶段通过 FFmpeg 叠加到对应位置。';

export const PRETRAILER_CREATIVE_STRATEGY_PROMPT =
  '内容创意可采用一种或多种吸睛策略：制造悬念或冲突、展示奇观或超现实画面、突出产品核心卖点或用户痛点、采用反转或反差叙事、营造与原片一致的沉浸式氛围。镜头语言应简洁有力、节奏紧凑，避免冗长铺垫，可使用特写、快速推拉、环绕等运镜增强动感和视觉冲击力；色调和光线质感必须与原片保持一致，确保视觉连贯。';

export const PRIVATE_REASONING_PROMPT =
  '内部分析要求：请先在内部完成时间轴理解、广告业务判断、风险识别和策略选择，不要输出推理链、分析过程或解释文本；正文只输出指定 JSON。';

export const SEEDANCE_VC_ROUTER_PROMPT =
  'Seedance Prompt Router：先在内部判断场景适配度、表达方式和信息密度，再决定直传、轻改、重写、追问或保留。用户明确要求、对白、旁白、音乐、音效、字幕策略、产品露出和品牌限制是硬约束，不能为了优化画面而删除。';

export const REFERENCE_POLICY_PROMPT =
  '参考素材策略：商品图优先保持外观、颜色、包装和文字不变形；人物图只参考长相、发型、服装和年龄感；参考图只用于稳定人物、商品、场景或风格锚点；参考音频只借节奏、语气、情绪或音效氛围，不直接复刻原音频内容；参考视频只借主体位置、动作节奏、镜头连续性和衔接，不复制具体人物身份、场景和画面；无参考素材时必须基于脚本和分镜生成，不要声称参考了不存在的视频、图片或音频。';

export const SEEDANCE_PROMPT_CARD_PROMPT =
  'SeedancePromptCard 正文必须包含 visualAnchor、behaviorState、localTone、videoTheme、referencePolicy、preservedConstraints、forbidden、repairHint；seedancePrompt 要能直接传给 Seedance 生成视频。';

export const AD_QUALITY_RUBRIC_PROMPT =
  '质量 Rubric：首秒停留、广告信息清晰度、画面完成度、参考一致性、差异化/首发潜力、合规安全性都要可判断；若质检失败，repairPrompt 必须能直接用于二次生成。';

export const SEEDANCE_SINGLE_CALL_DURATION_PROMPT =
  'Seedance 单次生成时长约束：所有会作为视频生成接口 durationSec 的片段必须在 4-15 秒；不足 4 秒的镜头必须合并到相邻片段，超过 15 秒的镜头必须拆成多个连续片段，禁止输出 1-3 秒或超过 15 秒的生成片段。';

const VIDEO_SCORING_CATEGORY_LABELS: Record<AdVideoScoringCategory, string> = {
  brand: '品牌广告',
  performance: '买量广告',
  creative: '创意广告',
};

export const WORKFLOW_PROMPT_DEFINITIONS = {
  'explosion.script_parse': {
    title: '脚本解析',
    description: '直接理解完整原视频，结合 ASR 文案拆解原片结构。',
    variables: ['transcriptText'],
    defaultPrompt:
      `${PRIVATE_REASONING_PROMPT}直接观看完整广告视频，结合 ASR 文案拆解原片脚本、首秒钩子、节奏、转场、卖点、证据背书、情绪曲线与 CTA 关键词。不需要关键帧输入。${AD_CREATIVE_STRUCTURE_PROMPT}${AD_QUALITY_RUBRIC_PROMPT}${REFERENCE_POLICY_PROMPT}只输出 JSON：{"cta_keywords":["..."],"selling_points":["..."],"hook_formula":"首秒如何让人停留","hookFormula":"首秒钩子公式","conversion_triggers":["痛点/爽点/证据/权益"],"rhythm":"...","original_script":"...","highValueSegments":[{"timeRange":"0-3s","reason":"保留原因","preserve":"结构/节奏/情绪/话术"}],"replaceableSegments":[{"timeRange":"8-12s","reason":"可替换原因"}],"similarityRisk":"low|medium|high","referencePolicy":"后续裂变生成时参考原片借什么、不借什么","scenes":[{"index":1,"durationSec":3,"visualPrompt":"画面主体、场景、动作、情绪、节奏和广告意图","narration":"对应口播或字幕","transition":"转场方式"}],"riskNotes":["..."]}。ASR 文案：{transcriptText}`,
  },
  'explosion.rewrite': {
    title: '裂变改写',
    description: '生成新脚本并拆成可用于视频生成的分镜。',
    variables: ['variantCount', 'ctaKeywords', 'transcriptText', 'scriptParseJson'],
    defaultPrompt:
      `${PRIVATE_REASONING_PROMPT}基于原视频理解、原文案与分镜裂变 {variantCount} 条。${AD_CREATIVE_STRUCTURE_PROMPT}${SEEDANCE_VC_ROUTER_PROMPT}${REFERENCE_POLICY_PROMPT}${SEEDANCE_SINGLE_CALL_DURATION_PROMPT}先生成完整新脚本，再把脚本拆成可用于视频生成的 storyboard。每条变体必须复用原片高转化结构，但更换钩子、场景或利益点表达，避免同质化。每个 visualPrompt 必须写成 Seedance 友好的视觉锚点、行为状态、局部调性和广告目的，不要堆叠低价值摄影参数。每个分镜如有口播、对白或字幕意图，写入 narration 供脚本文案确认与视频生成参考；不要为爆款裂变设计单独的外部 TTS 音频。${VIDEO_COMPOSITION_PROMPT}${SEEDANCE_DIRECTOR_PROMPT}${AD_MATERIAL_QUALITY_PROMPT}必须保留 CTA 关键词：{ctaKeywords}\n只输出 JSON 数组，每项包含 {"index":1,"strategy":"shot_replace|avatar_replace|product_shot_replace|pretrailer_add|hot_opening_reuse|remix","copy":"...","script":"...","preserve":["结构/节奏/转化触发点"],"replace":["非核心画面/人物/场景/利益点表达"],"differenceTarget":"画面差异目标","variantReason":"该变体的差异化理由","storyboard":[{"index":1,"durationSec":4,"visualPrompt":"...","narration":"口播、对白或字幕意图，没有则为空","transition":"...","visualAnchor":"...","behaviorState":"...","localTone":"...","videoTheme":"..."}]}。\n原文案：{transcriptText}\n原片拆解：{scriptParseJson}`,
  },
  'explosion.seedance': {
    title: '视频生成',
    description: '把裂变脚本和分镜组装成 Seedance 视频生成 Prompt。',
    variables: ['copy', 'script', 'storyboard', 'referencePolicy'],
    defaultPrompt: `${SEEDANCE_VC_ROUTER_PROMPT}${SEEDANCE_PROMPT_CARD_PROMPT}\n裂变文案：{copy}\n\n完整脚本：{script}\n\n按以下分镜生成视频：\n{storyboard}\n\n参考素材使用方式：{referencePolicy}\n\n爆款裂变视频由 Seedance 直接生成最终音画效果，不额外传入 reference_audio，不在本地做语音合成或音频替换。${VIDEO_COMPOSITION_PROMPT}${SEEDANCE_DIRECTOR_PROMPT}${AD_CREATIVE_STRUCTURE_PROMPT}${AD_MATERIAL_QUALITY_PROMPT}`,
  },
  'pretrailer.understand': {
    title: '视频理解',
    description: '直接输入完整原广告视频，理解产品、画面风格和受众。',
    variables: [],
    defaultPrompt:
      `${PRIVATE_REASONING_PROMPT}直接观看完整广告视频进行理解，禁止把视频抽帧成图片或依赖单张关键帧。分析广告产品类目、核心卖点、产品外观、场景、人物、色调、构图、镜头语言、光线质感、节奏变化、首秒钩子、证据背书、目标人群、原片开头语义、前贴衔接需求和审核风险。只输出 JSON：{"confidence":0.8,"category":"...","productOrStoryAnchor":"产品/故事锚点","sellingPoints":["..."],"hookFormula":"...","proofPoints":["..."],"visualStyle":"包含产品、场景、人物、色调、构图、镜头语言、光线质感和节奏变化的完整视觉描述","audience":"...","audiencePain":"...","openingContext":"原片开头语义","transitionNeeds":"前贴如何自然接原片","endingFrameContext":"前贴末帧应如何承接原片首帧","riskNotes":["..."]}。`,
  },
  'pretrailer.copy_gen': {
    title: '前贴文案',
    description: '生成 1 秒内有钩子的广告前贴文案。',
    variables: ['pretrailerDuration', 'videoType', 'style', 'visualStyle'],
    defaultPrompt:
      `${PRIVATE_REASONING_PROMPT}生成 {pretrailerDuration}s 广告前贴，视频生成类型：{videoType}。类型提示词模板：{style}必须把原片产品、场景、人物、色调、构图、镜头语言和光线质感融合进文案创意：{visualStyle}。前贴声音由视频生成模型直接生成，不再单独生成本地 TTS 口播音频；text 是给视频生成参考的钩子文案/声音意图，必须能被画面直接表达。${AD_CREATIVE_STRUCTURE_PROMPT}${PRETRAILER_CREATIVE_STRATEGY_PROMPT}${AD_MATERIAL_QUALITY_PROMPT}要求协调但差异化，1 秒内出现核心钩子。先内部比较不同 hook 方向，正文只输出 JSON：{"candidates":[{"hookType":"conflict|contrast|pain|spectacle|spoken_question","text":"...","hookAtSec":0.5,"firstSecondVisual":"首秒画面钩子","reason":"适合原因","riskNote":"合规风险规避说明"}],"selectedIndex":1,"text":"最终前贴钩子文案或声音意图","hookAtSec":0.5,"hookVisual":"最终首秒画面钩子","riskNote":"最终风险规避说明"}。`,
  },
  'pretrailer.script_gen': {
    title: '前贴分镜',
    description: '把前贴文案拆成短镜头脚本。',
    variables: ['pretrailerDuration', 'copyText', 'understandingJson', 'videoType', 'style'],
    defaultPrompt:
      `${PRIVATE_REASONING_PROMPT}为 {pretrailerDuration}s 广告前贴生成分镜。视频生成类型：{videoType}。类型提示词模板：{style}分镜必须把该类型落实为可拍/可生成的画面机制，首镜头就体现类型特征；例如巨物/微型前贴必须明确巨物或微型主体、真实环境参照物、尺度反差和轻喜剧动作，ASMR 前贴必须明确切割/压碎/爆开对象、近景细节和感官声音线索。前贴声音由视频生成模型直接生成，不再单独生成本地 TTS 口播音频；如需要对白、音效或旁白，只把它写进镜头 prompt 作为音画同步意图。后续视频生成接口单次 durationSec 使用 {pretrailerDuration}s，必须保持在 4-15 秒范围内；shots.durationSec 仅表达镜头节奏，首镜头必须 <=1 秒，并承担停留钩子。${AD_CREATIVE_STRUCTURE_PROMPT}${PRETRAILER_CREATIVE_STRATEGY_PROMPT}${SEEDANCE_VC_ROUTER_PROMPT}每个镜头 prompt 必须写清楚产品、场景、人物、动作、色调、光线质感、情绪、前后景层次、节奏、声音意图，以及该前贴类型的视觉锚点；自然继承原片理解中的视觉元素；不使用原片关键帧作为生成参考。${VIDEO_COMPOSITION_PROMPT}${SEEDANCE_DIRECTOR_PROMPT}${AD_MATERIAL_QUALITY_PROMPT}文案：{copyText}。原片理解：{understandingJson}。只输出 JSON：{"firstSecondVisual":"0-1s 视觉钩子，必须体现所选前贴类型","transitionPlan":"前贴如何接原片","endingFramePrompt":"末帧衔接描述","shots":[{"index":1,"durationSec":1,"prompt":"必须体现所选前贴类型的画面描述，可包含视频生成内置声音意图","visualAnchor":"类型视觉锚点","behaviorState":"动作状态","localTone":"局部调性","videoTheme":"前贴类型与广告目的"}]}。`,
  },
  'pretrailer.seedance': {
    title: '前贴生成',
    description: '把前贴分镜传给视频生成模型。',
    variables: ['scriptJson', 'referencePolicy'],
    defaultPrompt: `${SEEDANCE_VC_ROUTER_PROMPT}${SEEDANCE_PROMPT_CARD_PROMPT}\n前贴分镜 JSON：{scriptJson}\n\n参考素材使用方式：{referencePolicy}\n\n要求首帧必须强钩子，末帧必须能自然接原片。前贴声音、音效、对白或旁白由视频生成模型直接生成，不额外传入本地 TTS 音频。${VIDEO_COMPOSITION_PROMPT}${SEEDANCE_DIRECTOR_PROMPT}${AD_CREATIVE_STRUCTURE_PROMPT}${AD_MATERIAL_QUALITY_PROMPT}`,
  },
  'avatar.validate_avatar': {
    title: '数字人校验',
    description: '判断用户选择的数字人图片是否可用于生成。',
    variables: [],
    defaultPrompt: `${PRIVATE_REASONING_PROMPT}校验图片是否正面、清晰、单人，并判断是否适合转化型数字人口播：面部遮挡、过度侧脸、复杂背景、年龄不确定、表情不可信都要标记风险。只输出 JSON：{"valid":true,"reason":"...","credibility":"可信/亲切/专业/不适合","risks":["..."]}。`,
  },
  'avatar.image_generation': {
    title: '角色图生成',
    description: '把真人参考图转换为适合数字人口播的同角色图片。',
    variables: [],
    defaultPrompt:
      '基于参考照片生成一张可用于数字人口播视频的同一角色图片。要求人物身份、五官、发型、年龄、气质和服装风格与原图保持一致；生成结果必须是非真人照片质感的高保真角色形象，正面清晰单人半身构图，干净背景，自然光照，不添加文字、Logo、水印或新人物。',
  },
  'avatar.product_understand': {
    title: '商品理解',
    description: '从产品图中识别形态、颜色和视觉卖点。',
    variables: [],
    defaultPrompt:
      `${PRIVATE_REASONING_PROMPT}识别产品形态、颜色、可见卖点、可证明信息和不应夸大的承诺。只输出 JSON：{"shape":"...","color":"...","sellingPoints":["...","..."],"visibleProofPoints":["..."],"requiredVisualElements":["..."],"forbiddenClaims":["..."],"visualRisks":["..."]}。`,
  },
  'avatar.brand_parse': {
    title: '品牌解析',
    description: '从品牌介绍中提取调性、人群和差异化点。',
    variables: ['brandIntro'],
    defaultPrompt:
      `${PRIVATE_REASONING_PROMPT}解析品牌介绍，提取转化型口播需要的人群、痛点、卖点、证据、禁用承诺和语气。只输出 JSON：{"tone":"...","audience":"...","audiencePain":"...","oneLineBenefit":"...","differentiators":["...","..."],"proofPoints":["..."],"forbiddenClaims":["..."]}。\n品牌介绍：{brandIntro}`,
  },
  'avatar.script_gen': {
    title: '口播脚本',
    description: '生成数字人口播文案和产品露出时间轴。',
    variables: ['duration', 'brandJson', 'productJson', 'productImageCount'],
    defaultPrompt:
      `${PRIVATE_REASONING_PROMPT}生成 {duration}s 转化型数字人口播脚本，短句化、可 TTS、自然停顿，至少 2 个产品差异化卖点，并规避禁用承诺。数字人生成节点会把长口播按 4-15 秒单次调用范围切分，请让语义断句自然可切分，不要设计成必须单次超过 15 秒才能成立的连续动作。可内部比较痛点设问、福利利益、对比反差、轻剧情四类方向，正文只输出最终 JSON：{"text":"完整口播","hookType":"pain_question|benefit|contrast|micro_story","differentiators":["...","..."],"ttsNotes":"语速、停顿、情绪","avatarSceneType":"single_talking|product_overlay|picture_in_picture|desk_demo","timeline":[{"sellingPoint":"...","atSec":4,"productImageIndex":0,"visualAction":"产品如何露出"}],"riskControl":"..."}。品牌：{brandJson}。产品：{productJson}。产品图数量：{productImageCount}`,
  },
  'avatar.seedance_avatar': {
    title: '数字人生成',
    description: '控制数字人口播的视频生成风格。',
    variables: [],
    defaultPrompt: `${SEEDANCE_VC_ROUTER_PROMPT}基于参考音频驱动数字人口播，音频、唇形、人物一致性是硬约束，不要过度 Vibe 改写。保持正面清晰构图、自然唇形、可信表情、轻微手势、稳定眼神和干净广告背景；可按单人出镜、产品贴片、画中画、桌面讲解组织画面。${REFERENCE_POLICY_PROMPT}${VIDEO_COMPOSITION_PROMPT}`,
  },
  'copywriting.template_optimize': {
    title: '模板优化',
    description: '把匹配到的行业模板优化成当前需求的脚本生成策略。',
    variables: ['industryTitle', 'formula', 'durationRange', 'requiredModules', 'complianceFocus', 'requirement', 'productName', 'audience', 'platform', 'format', 'durationSec', 'variantCount'],
    defaultPrompt:
      `${PRIVATE_REASONING_PROMPT}你将接收一个已匹配的广告行业模板，请结合用户需求把它优化成“广告文案脚本编写 Agent”的任务专用模板。先在内部判断行业匹配度、用户真实意图、可复用公式、需要增删的模块、合规边界和脚本输出形态，不要输出推理链。${AD_CREATIVE_STRUCTURE_PROMPT}${AD_MATERIAL_QUALITY_PROMPT}${AD_QUALITY_RUBRIC_PROMPT}匹配行业：{industryTitle}\n行业公式：{formula}\n行业建议时长：{durationRange}\n行业必备模块：{requiredModules}\n合规重点：{complianceFocus}\n用户需求：{requirement}\n产品名称：{productName}\n目标人群：{audience}\n投放平台：{platform}\n脚本形式：{format}\n目标时长：{durationSec}s\n输出数量：{variantCount}\n只输出 JSON：{"industryFit":"high|medium|low","templateName":"...","optimizedFormula":"当前需求下的脚本公式","mustUseModules":["..."],"optionalModules":["..."],"angleLibrary":["痛点设问","场景反差","证据背书"],"writingRules":["..."],"complianceRules":["..."],"riskNotes":["..."],"agentPlan":["需求拆解重点","策略分析重点","脚本生成重点"]}。`,
  },
  'copywriting.web_research': {
    title: '联网补充',
    description: '用 Ark Responses web_search 补充产品相关信息、用户关注点和热梗语境。',
    variables: ['industryTitle', 'optimizedTemplateJson', 'requirement', 'productName', 'audience', 'platform', 'format'],
    defaultPrompt:
      `${PRIVATE_REASONING_PROMPT}请联网检索并总结广告文案脚本生成可用的信息，重点补充产品相关信息、竞品/同类表达、用户关注点、近期热点语境和可安全借用的热梗。不要编造来源，不要输出推理链；热梗只保留适合商业广告且不过时、不冒犯、不侵权的表达。行业：{industryTitle}\n优化模板：{optimizedTemplateJson}\n用户需求：{requirement}\n产品名称：{productName}\n目标人群：{audience}\n投放平台：{platform}\n脚本形式：{format}\n只输出 JSON：{"summary":"联网补充摘要","productInsights":["产品或同类品类信息"],"trendInsights":["热点/平台语境"],"memeInsights":["可安全借用的热梗表达"],"riskNotes":["需规避的过时、侵权或不实表达"]}。`,
  },
  'copywriting.requirement_decompose': {
    title: '需求拆解',
    description: '基于优化后的行业模板拆解产品、人群、卖点、约束和创意角度。',
    variables: ['industryTemplateJson', 'optimizedTemplateJson', 'researchJson', 'requirement', 'productName', 'audience', 'platform', 'format', 'durationSec', 'variantCount'],
    defaultPrompt:
      `${PRIVATE_REASONING_PROMPT}请基于已匹配行业模板、优化模板和联网补充拆解广告文案脚本需求，先在内部判断产品类别、目标人群、真实痛点、可证明卖点、转化目标、平台语境和合规风险，不要输出推理链。联网补充只能作为辅助线索，不得把未验证信息写成确定事实。${AD_CREATIVE_STRUCTURE_PROMPT}${AD_MATERIAL_QUALITY_PROMPT}行业模板：{industryTemplateJson}\n优化模板：{optimizedTemplateJson}\n联网补充：{researchJson}\n输入需求：{requirement}\n产品名称：{productName}\n目标人群：{audience}\n投放平台：{platform}\n脚本形式：{format}\n目标时长：{durationSec}s\n输出数量：{variantCount}\n只输出 JSON：{"product":{"name":"...","category":"...","coreValue":"..."},"audience":{"segment":"...","painPoints":["..."],"desires":["..."],"objections":["..."]},"offer":{"sellingPoints":["..."],"proofPoints":["..."],"ctaGoal":"..."},"constraints":{"platform":"...","format":"...","durationSec":30,"mustInclude":["..."],"avoid":["..."],"riskNotes":["..."]},"creativeAngles":["痛点设问","场景反差","证据背书"],"templateApplications":["行业公式如何落到本需求"]}。`,
  },
  'copywriting.strategy_analysis': {
    title: '策略分析',
    description: '基于优化模板和需求拆解选择爆款钩子、转化路径和脚本结构。',
    variables: ['requirement', 'optimizedTemplateJson', 'researchJson', 'decompositionJson'],
    defaultPrompt:
      `${PRIVATE_REASONING_PROMPT}基于优化后的行业模板、联网补充和需求拆解做广告策略分析。请在内部深度比较不同钩子、情绪杠杆、证据路径、热梗适配度、风险表达和转化节奏，不输出推理链；正文只给可执行策略 JSON。热梗必须服务卖点，不要硬蹭热点。${AD_CREATIVE_STRUCTURE_PROMPT}${AD_QUALITY_RUBRIC_PROMPT}原始需求：{requirement}\n优化模板：{optimizedTemplateJson}\n联网补充：{researchJson}\n需求拆解：{decompositionJson}\n只输出 JSON：{"positioning":"一句话定位","audienceInsight":"人群洞察","selectedTemplateLogic":"采用该行业模板的核心原因","hookStrategies":[{"name":"...","firstSecond":"首秒钩子或首句","whyItWorks":"有效原因","riskControl":"风险规避"}],"conversionPath":["停留","兴趣","信任","行动"],"tone":"语气风格","proofStrategy":["可用证据或场景背书"],"scriptBlueprint":{"opening":"...","middle":"...","proof":"...","cta":"..."},"qualityChecklist":["首秒明确","卖点可证明","CTA自然"]}。`,
  },
  'copywriting.script_writer': {
    title: '爆款脚本',
    description: '输出可直接预览和复用的爆款广告脚本。',
    variables: ['optimizedTemplateJson', 'researchJson', 'decompositionJson', 'analysisJson', 'variantCount', 'durationSec', 'format'],
    defaultPrompt:
      `${PRIVATE_REASONING_PROMPT}请根据优化行业模板、联网补充、需求拆解和策略分析，输出 {variantCount} 条可投放方向不同的爆款广告脚本，目标时长 {durationSec}s，脚本形式 {format}。开启高强度思考，但不要输出推理链；每条脚本必须遵守优化模板中的公式、模块和合规规则，并有强钩子、清晰卖点、自然转化和可执行表达。可使用联网补充里的产品信息和热梗，但必须自然、不过时、不冒犯、不声称未经验证的事实。${AD_CREATIVE_STRUCTURE_PROMPT}${AD_MATERIAL_QUALITY_PROMPT}最终脚本产物只保留“完整广告文案/脚本”本身，不要再输出节奏 beats、画面建议、CTA 字段、风险控制字段或其他拆分字段。优化模板：{optimizedTemplateJson}\n联网补充：{researchJson}\n需求拆解：{decompositionJson}\n策略分析：{analysisJson}\n只输出 JSON：{"scripts":[{"index":1,"title":"...","script":"完整广告文案/脚本"}],"summary":"整体投放建议"}。`,
  },
  'ecommerce_image.product_understand': {
    title: '商品图理解',
    description: '识别商品主体、品类、视觉特征、牛皮癣文字和背景问题。',
    variables: ['productName', 'sellingPoints'],
    defaultPrompt:
      `${PRIVATE_REASONING_PROMPT}你是电商商品主图理解助手。请直接分析输入商品图片，识别商品主体、品类、包装视觉、背景干扰、非商品文案、衬底、logo、牛皮癣样式元素和可安全表达的卖点。不要输出推理链，不要编造图片中不存在的品牌或功效。产品名：{productName}\n用户补充卖点：{sellingPoints}\n只输出 JSON：{"productName":"...","category":"...","visualFeatures":["颜色","形状","包装元素"],"suspectedTextNoise":["非商品文案/水印/装饰元素"],"backgroundIssues":["杂乱衬底","促销贴纸"],"sellingPoints":["可安全使用的短卖点"],"complianceRisks":["价格/功效/授权风险"]}。`,
  },
  'ecommerce_image.copy_generate': {
    title: '包装文案生成',
    description: '生成适合图片包装的短卖点、词性标注和样式策略。',
    variables: ['productJson', 'fixedCopy', 'sellingPoints', 'style'],
    defaultPrompt:
      `${PRIVATE_REASONING_PROMPT}请为电商图片包装生成短文案和渲染策略。文案有两类来源：若用户提供固定文案则在保留语义的基础上丰富；否则基于商品理解和用户卖点生成个性化短卖点。请进行词性标注，名词适合放大，形容词适合强调质感或效果，避免绝对化承诺。商品理解：{productJson}\n固定文案：{fixedCopy}\n用户卖点：{sellingPoints}\n包装风格：{style}\n只输出 JSON：{"headline":"主标题，8-14字","subHeadline":"副标题，8-18字","badges":["短徽标1","短徽标2"],"keywords":[{"text":"洗面奶","partOfSpeech":"noun|adjective|verb|other","emphasis":"high|medium|low"}],"styleHints":["italic","stroke","border","top_bottom_border","background"],"colorStrategy":"分析背景左上角和右下角，选择同色系深色或对比色","riskControl":"合规规避"}。`,
  },
  'ecommerce_image.main_image_beautify': {
    title: '主图美化',
    description: '用图像生成清理非商品文案、衬底、logo 和牛皮癣元素。',
    variables: ['productJson', 'style'],
    defaultPrompt:
      '请对参考商品主图做电商主图美化：去除非商品文案、促销贴纸、水印、杂乱衬底、无关 logo、牛皮癣式文字块和低质装饰元素；保留商品主体、包装形状、真实颜色、材质、可读商品包装信息和广告安全背景。不要改变商品品类和包装核心识别，不要新增无法证明的文字。风格：{style}。商品理解：{productJson}。输出为干净可继续包装的商品主图。',
  },
  'ecommerce_image.background_replace': {
    title: '背景替换',
    description: '保持商品主体不变，替换并融合电商场景背景。',
    variables: ['productJson', 'style', 'scene', 'variantIndex'],
    defaultPrompt:
      '请基于参考商品图做电商背景替换与前背景融合。商品主体必须保持位置、形状、颜色、包装和可识别文字稳定，不重绘商品本体；只重绘和扩展背景，让商品自然置于指定场景中。场景：{scene}。风格：{style}。变体编号：{variantIndex}。商品理解：{productJson}。要求光影一致、边缘自然、无多余文字、水印和伪品牌元素。',
  },
  'ecommerce_image.copy_render': {
    title: '文案渲染',
    description: '遵循渲染计划，在背景替换结果上稳定渲染标题、副标题和徽标。',
    variables: ['productJson', 'copyJson', 'renderPlanJson', 'style', 'scene', 'variantIndex'],
    defaultPrompt:
      '请在参考电商图上进行文案包装渲染，并严格遵循 render_plan.json 中对应变体的文字布局、强调关键词、颜色策略、禁区和可读性规则。只使用文案 JSON 中的 headline、subHeadline 和 badges，不要生成乱码、错别字、额外文字、伪品牌、虚假价格或绝对化承诺。文字渲染必须稳定清晰：优先保证中文笔画完整、字形不变形、边缘无重影；同一短语必须完整连续，不要拆字、漏字或改写。智能配色：按渲染计划选择同色系深色或高对比安全色，必要时使用描边、斜体、矩形包裹、上下边框或衬底增强可读性。智能大小：keywords 中 partOfSpeech=noun 且 emphasis=high 的词要放大，形容词可用描边或填充/边缘色互换。不得遮挡商品主体、包装核心识别和 render_plan.json 标记的 forbiddenRegions。风格：{style}。场景：{scene}。变体：{variantIndex}。商品理解：{productJson}。文案计划：{copyJson}。渲染计划：{renderPlanJson}。',
  },
  'video_scoring.brand_score': {
    title: '品牌广告打分',
    description: '基于品牌广告维度评估完整视频，输出分数、证据、分析和建议。',
    variables: ['bgmAnalysisText'],
    defaultPrompt:
      `${PRIVATE_REASONING_PROMPT}你是品牌广告评估专家。先过合规红线，再观看完整视频（这是一条品牌广告，目标=心智渗透与品牌好感）。直接输入完整视频，不要抽帧。结合以下本地 BGM 音乐分析结果判断配乐是否与品牌氛围、节奏和记忆点匹配：{bgmAnalysisText}。对以下维度各打 0-100 分，并给出对应证据时间点。若合规不通过，仍需返回可展示的局部结果：category、compliancePass=false、complianceIssues、analysis、suggestions，可将 dimensionScores 置为空对象。维度包括：品牌露出与一致性、制作精良度、情感叙事与好感度、黄金3秒吸引力、新颖度差异化。评分倾向：品牌露出与一致性 > 制作精良度 > 情感叙事与好感度 > 黄金3秒吸引力 ≈ 新颖度差异化。只输出 JSON：{"category":"brand","compliancePass":true,"complianceIssues":["..."],"dimensionScores":{"品牌露出与一致性":0,"制作精良度":0,"情感叙事与好感度":0,"黄金3秒吸引力":0,"新颖度差异化":0},"evidence":{"品牌露出与一致性":"时间点+依据"},"analysis":"整体分析（品牌资产视角）","suggestions":["可执行优化建议1","建议2"]}。`,
  },
  'video_scoring.performance_score': {
    title: '买量广告打分',
    description: '基于买量广告维度评估完整视频，输出分数、证据、分析和建议。',
    variables: ['bgmAnalysisText'],
    defaultPrompt:
      `${PRIVATE_REASONING_PROMPT}你是买量广告（效果广告）评估专家。先过合规红线，再观看完整视频（这是一条买量广告，目标=促成下载或购买转化）。直接输入完整视频，不要抽帧。结合以下本地 BGM 音乐分析结果判断配乐是否支撑首秒吸引、转化节奏和 CTA 压力：{bgmAnalysisText}。对以下维度各打 0-100 分，并给出对应证据时间点。若合规不通过，仍需返回可展示的局部结果：category、compliancePass=false、complianceIssues、analysis、suggestions，可将 dimensionScores 置为空对象。维度包括：黄金3秒钩子、内容信任力、利益点与诱惑力、CTA与转化行动力、转化链路流畅度、制作合格度。评分倾向：黄金3秒钩子 ≈ CTA与转化行动力 > 利益点与诱惑力 > 内容信任力 ≈ 转化链路流畅度 > 制作合格度。只输出 JSON：{"category":"performance","compliancePass":true,"complianceIssues":["..."],"dimensionScores":{"黄金3秒钩子":0,"内容信任力":0,"利益点与诱惑力":0,"CTA与转化行动力":0,"转化链路流畅度":0,"制作合格度":0},"evidence":{"黄金3秒钩子":"时间点+依据"},"analysis":"整体分析（转化链路视角）","suggestions":["可执行优化建议1","建议2"]}。`,
  },
  'video_scoring.creative_score': {
    title: '创意广告打分',
    description: '基于创意广告维度评估完整视频，输出分数、证据、分析和建议。',
    variables: ['bgmAnalysisText'],
    defaultPrompt:
      `${PRIVATE_REASONING_PROMPT}你是创意广告评估专家。先过合规红线，再观看完整视频（这是一条创意广告，目标=记忆点与自传播）。直接输入完整视频，不要抽帧。结合以下本地 BGM 音乐分析结果判断配乐是否强化创意节奏、情绪张力与记忆点：{bgmAnalysisText}。对以下维度各打 0-100 分，并给出对应证据时间点。若合规不通过，仍需返回可展示的局部结果：category、compliancePass=false、complianceIssues、analysis、suggestions，可将 dimensionScores 置为空对象。维度包括：新颖度创意跳跃度、黄金3秒吸引力、节奏与紧凑度、记忆点传播性、情绪共鸣度、信息传达清晰度。评分倾向：新颖度创意跳跃度 > 黄金3秒吸引力 > 节奏与紧凑度 ≈ 记忆点传播性 > 情绪共鸣度 > 信息传达清晰度。只输出 JSON：{"category":"creative","compliancePass":true,"complianceIssues":["..."],"dimensionScores":{"新颖度创意跳跃度":0,"黄金3秒吸引力":0,"节奏与紧凑度":0,"记忆点传播性":0,"情绪共鸣度":0,"信息传达清晰度":0},"evidence":{"新颖度创意跳跃度":"时间点+依据"},"analysis":"整体分析（创意与传播视角）","suggestions":["可执行优化建议1","建议2"]}。`,
  },
  'native.concept_plan': {
    title: '行业概念规划',
    description: '按行业策略矩阵生成爆款广告创意方案。',
    variables: ['industryTitle', 'formula', 'durationRange', 'requiredModules', 'complianceFocus', 'brief', 'productName', 'variantCount', 'durationSec', 'ratio'],
    defaultPrompt:
      `${PRIVATE_REASONING_PROMPT}为{industryTitle}行业生成 {variantCount} 条原生爆款广告概念。行业公式：{formula}。目标时长：{durationSec}s，规格：{ratio}，行业建议时长：{durationRange}。必备模块：{requiredModules}。合规重点：{complianceFocus}。产品：{productName}。广告文案脚本：{brief}。${AD_CREATIVE_STRUCTURE_PROMPT}${AD_MATERIAL_QUALITY_PROMPT}${AD_QUALITY_RUBRIC_PROMPT}只输出 JSON：{"concepts":[{"index":1,"title":"...","materialFormula":"行业公式如何落到本条素材","hook":"首秒可视化钩子","firstSecondHook":"0-1s 画面","audience":"...","sellingPoints":["..."],"proofPoint":"可信证据或使用场景","modules":["..."],"cta":"...","tone":"...","noveltyAngle":"差异化角度","commodityAssetFit":"商品/资产匹配说明","riskControl":"合规规避策略"}]}。`,
  },
  'native.script_writer': {
    title: '行业脚本生成',
    description: '把创意方案写成可投放广告脚本。',
    variables: ['industryTitle', 'brief', 'conceptsJson', 'durationSec'],
    defaultPrompt:
      `${PRIVATE_REASONING_PROMPT}基于{industryTitle}行业策略，把概念写成 {durationSec}s 原生广告脚本。${AD_CREATIVE_STRUCTURE_PROMPT}${SEEDANCE_SINGLE_CALL_DURATION_PROMPT}若总时长超过 15s，请按 Seedance 可生成片段规划节奏，每段 4-15s，例如 25s 拆为 15s + 10s。口播要短句化、可配音、避免堆砌形容词，CTA 自然但明确；证据点必须来自输入或合理使用场景，不编造不可证明承诺。广告文案脚本：{brief}。概念：{conceptsJson}。只输出 JSON：{"scripts":[{"index":1,"title":"...","script":"完整口播/字幕脚本","voiceover":"可用于 TTS 的口播文本","cta":"...","hookType":"pain|benefit|conflict|spectacle|story","riskControl":"...","beats":[{"timeSec":0,"text":"首秒钩子"},{"timeSec":3,"text":"卖点或证据"}]}]}。`,
  },
  'native.storyboard_builder': {
    title: '分镜构建',
    description: '把脚本拆成视频生成可用分镜。',
    variables: ['industryTitle', 'ratio', 'scriptsJson', 'durationSec'],
    defaultPrompt:
      `${PRIVATE_REASONING_PROMPT}把{industryTitle}广告脚本拆成适合 Seedance 生成的分镜，视频比例 {ratio}，总时长约 {durationSec}s。${SEEDANCE_SINGLE_CALL_DURATION_PROMPT}若总时长超过 15s，请拆为多个连续片段，每段 4-15s，例如 25s 拆为 15s + 10s，并让 shots 的 durationSec 累计接近总时长。${SEEDANCE_VC_ROUTER_PROMPT}每个 videoPrompt 必须写清楚视觉锚点、行为状态、局部调性和广告目的，避免低价值摄影参数堆叠。${VIDEO_COMPOSITION_PROMPT}${SEEDANCE_DIRECTOR_PROMPT}${AD_CREATIVE_STRUCTURE_PROMPT}${AD_MATERIAL_QUALITY_PROMPT}${VIDEO_TEXT_STICKER_PROMPT}首镜头承担首秒钩子，后续镜头按痛点/爽点、卖点证据、CTA 推进。脚本：{scriptsJson}。只输出 JSON：{"variants":[{"index":1,"title":"...","script":"...","voiceover":"...","shots":[{"index":1,"durationSec":4,"shotType":"ai_pretrailer|digital_human|product_demo|atmosphere|cta","imagePrompt":"场景图提示词，包含主体、环境、光线、构图和质感","videoPrompt":"视频镜头提示词，不包含文字贴纸、花字、字幕或任何可读文字","visualAnchor":"...","behaviorState":"...","localTone":"...","videoTheme":"...","referencePolicy":"...","voiceoverText":"对应口播文本，仅供节奏参考","module":"行业必备模块"}]}]}。`,
  },
  'native.compliance_rewrite': {
    title: '合规改写',
    description: '行业硬规则命中时重写脚本与分镜。',
    variables: ['industryTitle', 'violations', 'storyboardJson'],
    defaultPrompt:
      '以下{industryTitle}广告分镜命中合规风险：{violations}。请保留创意目标，去除风险表达并重写。只输出与原结构一致的 JSON：{storyboardJson}',
  },
  'native.asset_generator': {
    title: '素材生成',
    description: '把每条分镜合成为 Seedance 视频生成 Prompt。',
    variables: ['industryTitle', 'title', 'script', 'storyboard', 'ratio', 'referencePolicy'],
    defaultPrompt:
      `${SEEDANCE_VC_ROUTER_PROMPT}${SEEDANCE_PROMPT_CARD_PROMPT}\n{industryTitle}行业原生爆款广告：{title}\n成片比例：{ratio}\n脚本：{script}\n分镜：\n{storyboard}\n参考素材使用方式：{referencePolicy}\n${VIDEO_COMPOSITION_PROMPT}\n${SEEDANCE_DIRECTOR_PROMPT}\n${AD_CREATIVE_STRUCTURE_PROMPT}\n${AD_MATERIAL_QUALITY_PROMPT}\n${VIDEO_TEXT_STICKER_PROMPT}\n要求节奏明确，主体稳定，首秒钩子清晰，产品或剧情识别度高，画面中不出现多余文字、水印和品牌 Logo。`,
  },
  'native.consistency_checker': {
    title: '一致性检测',
    description: '检测生成视频与分镜、行业模块和合规约束是否一致。',
    variables: ['industryTitle', 'title', 'script', 'requiredModules', 'complianceFocus'],
    defaultPrompt:
      `${PRIVATE_REASONING_PROMPT}检查这条{industryTitle}广告视频是否符合标题、脚本、行业必备模块和合规重点，并评估首秒钩子、主体稳定、产品/剧情识别度、镜头连续性、无水印/无可读错字/无审核高风险表达、参考素材一致性和差异化。标题：{title}。脚本：{script}。必备模块：{requiredModules}。合规重点：{complianceFocus}。只输出 JSON：{"pass":true,"issues":[],"score":0.9,"scores":{"hook":0.9,"clarity":0.9,"story":0.9,"visualQuality":0.9,"referenceConsistency":0.9,"originality":0.9,"compliance":0.9},"repairPrompt":"失败时可直接用于 Seedance 的修复提示词","regeneratePolicy":"保留/重生成哪些片段","referenceMismatch":["..."]}。`,
  },
  'native.composer_compliance': {
    title: '成片合规',
    description: '成片入库前的最终文案合规提示。',
    variables: ['industryTitle', 'complianceFocus'],
    defaultPrompt: '最终成片需符合{industryTitle}行业合规重点：{complianceFocus}。',
  },
} as const;

export type WorkflowPromptId = keyof typeof WORKFLOW_PROMPT_DEFINITIONS;
export type WorkflowPromptOverrides = Partial<Record<WorkflowPromptId, string>>;

export interface WorkflowNodeDefinition {
  id: string;
  title: string;
  description: string;
  artifact: string;
  promptIds: WorkflowPromptId[];
}

export interface WorkflowDefinition {
  type: TaskType;
  title: string;
  description: string;
  nodes: WorkflowNodeDefinition[];
}

export const WORKFLOW_DEFINITIONS: Record<TaskType, WorkflowDefinition> = {
  explosion: {
    type: 'explosion',
    title: '广告爆款裂变',
    description: '从原视频理解脚本结构，生成多条分镜化裂变视频。',
    nodes: [
      { id: 'download', title: '素材导入', description: '准备 source.mp4 和 source.m4a。', artifact: 'meta.json', promptIds: [] },
      { id: 'asr', title: '语音识别', description: '识别原视频口播和字幕文案。', artifact: 'transcript.json', promptIds: [] },
      { id: 'script_parse', title: '脚本解析', description: '直接用视频视觉理解拆解原片脚本和分镜。', artifact: 'script_parse.json', promptIds: ['explosion.script_parse'] },
      { id: 'rewrite', title: '裂变改写', description: '生成新脚本并拆成 storyboard。', artifact: 'variants.json', promptIds: ['explosion.rewrite'] },
      { id: 'script_confirm', title: '脚本文案确认', description: '人工确认裂变脚本和分镜文案后继续生成。', artifact: 'variants.md', promptIds: [] },
      { id: 'video_prompt_optimize', title: '视频提示词优化', description: '把裂变脚本、分镜和参考策略整理为 Seedance 最终提示词。', artifact: 'video_prompts.json', promptIds: ['explosion.seedance'] },
      { id: 'seedance', title: '视频生成', description: '按优化后的提示词生成直出成片。', artifact: 'variant_<i>.mp4', promptIds: [] },
    ],
  },
  pretrailer: {
    type: 'pretrailer',
    title: '广告前贴',
    description: '理解原片，生成开场钩子并拼接到广告前。',
    nodes: [
      { id: 'ingest', title: '素材导入', description: '规范化原广告视频和音频。', artifact: 'source.mp4', promptIds: [] },
      { id: 'understand', title: '视频理解', description: '直接把完整视频输入大语言模型，分析产品、卖点、风格和受众。', artifact: 'understanding.json', promptIds: ['pretrailer.understand'] },
      { id: 'copy_gen', title: '前贴文案', description: '生成 1 秒内出现钩子的文案。', artifact: 'copy.json', promptIds: ['pretrailer.copy_gen'] },
      { id: 'script_gen', title: '前贴分镜', description: '把前贴文案拆成短分镜。', artifact: 'script.json', promptIds: ['pretrailer.script_gen'] },
      { id: 'script_confirm', title: '脚本文案确认', description: '人工确认前贴文案和分镜后继续生成。', artifact: 'script.json', promptIds: [] },
      { id: 'video_prompt_optimize', title: '视频提示词优化', description: '把前贴分镜和衔接策略整理为 Seedance 最终提示词。', artifact: 'video_prompts.json', promptIds: ['pretrailer.seedance'] },
      { id: 'seedance', title: '前贴生成', description: '按优化后的提示词直接生成带声音的前贴视频。', artifact: 'pretrailer.mp4', promptIds: [] },
      { id: 'concat', title: '成片拼接', description: '把前贴拼接到原广告前。', artifact: 'final.mp4', promptIds: [] },
    ],
  },
  avatar: {
    type: 'avatar',
    title: '数字人口播广告',
    description: '把品牌资料、产品图和数字人形象生成口播广告。',
    nodes: [
      { id: 'validate_avatar', title: '数字人校验', description: '校验人物图并生成角色参考图。', artifact: 'avatar_reference.png', promptIds: ['avatar.validate_avatar', 'avatar.image_generation'] },
      { id: 'product_understand', title: '商品理解', description: '识别产品视觉特征和卖点。', artifact: 'product.json', promptIds: ['avatar.product_understand'] },
      { id: 'brand_parse', title: '品牌解析', description: '提取品牌调性、人群和差异化点。', artifact: 'brand.json', promptIds: ['avatar.brand_parse'] },
      { id: 'script_gen', title: '口播脚本', description: '生成口播文案和时间轴。', artifact: 'script.json', promptIds: ['avatar.script_gen'] },
      { id: 'script_confirm', title: '脚本文案确认', description: '人工确认数字人口播文案后继续合成。', artifact: 'script.json', promptIds: [] },
      { id: 'tts', title: '语音合成', description: '把口播文案合成音频。', artifact: 'voice.mp3', promptIds: [] },
      { id: 'video_prompt_optimize', title: '视频提示词优化', description: '把口播脚本、产品露出和人物参考策略整理为数字人最终提示词。', artifact: 'video_prompts.json', promptIds: ['avatar.seedance_avatar'] },
      { id: 'seedance_avatar', title: '数字人生成', description: '用音频和优化后的提示词驱动数字人口播视频。', artifact: 'avatar.mp4', promptIds: [] },
      { id: 'overlay', title: '素材叠加', description: '按时间轴叠加产品图。', artifact: 'final.mp4', promptIds: [] },
      { id: 'postprocess', title: '成片处理', description: '入库最终视频。', artifact: 'final.mp4', promptIds: [] },
    ],
  },
  copywriting: {
    type: 'copywriting',
    title: '广告文案脚本编写',
    description: '输入需求后先匹配行业模板，再优化模板、拆解需求并输出爆款广告脚本。',
    nodes: [
      { id: 'industry_router', title: '行业模板路由', description: '从七行业模板中匹配最适合的文案脚本模板。', artifact: 'industry.json', promptIds: [] },
      { id: 'template_optimize', title: '模板优化', description: '用大模型把行业模板优化成当前需求的专用策略。', artifact: 'template.json', promptIds: ['copywriting.template_optimize'] },
      { id: 'web_research', title: '联网补充', description: '补充产品相关信息、用户关注点和热梗语境。', artifact: 'research.json', promptIds: ['copywriting.web_research'] },
      { id: 'requirement_decompose', title: '需求拆解', description: '基于优化模板拆解产品、人群、卖点、平台和约束。', artifact: 'requirement.json', promptIds: ['copywriting.requirement_decompose'] },
      { id: 'strategy_analysis', title: '策略分析', description: '选择钩子、转化路径和爆款脚本结构。', artifact: 'analysis.json', promptIds: ['copywriting.strategy_analysis'] },
      { id: 'script_writer', title: '爆款脚本', description: '生成多条可投放脚本并入库为文案素材。', artifact: 'scripts.md', promptIds: ['copywriting.script_writer'] },
    ],
  },
  video_scoring: {
    type: 'video_scoring',
    title: '广告视频打分',
    description: '对完整广告视频进行分类型评分，并输出证据、分析与优化建议。',
    nodes: [
      { id: 'ingest', title: '素材导入', description: '规范化本地视频输入，准备 source.mp4。', artifact: 'source.mp4', promptIds: [] },
      {
        id: 'score',
        title: '视频评分',
        description: `按广告类型（${VIDEO_SCORING_CATEGORY_LABELS.brand} / ${VIDEO_SCORING_CATEGORY_LABELS.performance} / ${VIDEO_SCORING_CATEGORY_LABELS.creative}）对完整视频直接打分。`,
        artifact: 'score.json',
        promptIds: ['video_scoring.brand_score', 'video_scoring.performance_score', 'video_scoring.creative_score'],
      },
      { id: 'report_writer', title: '结果整理', description: '把结构化评分整理为可读报告并登记到素材库。', artifact: 'report.md', promptIds: [] },
    ],
  },
  ecommerce_image: {
    type: 'ecommerce_image',
    title: '电商图片包装',
    description: '从商品主图理解、主图美化、背景替换到文案渲染，生成可外放的电商包装图片。',
    nodes: [
      { id: 'product_understand', title: '商品图理解', description: '识别商品主体、牛皮癣文字、背景问题和可用卖点，输出 product.json。', artifact: 'product.json', promptIds: ['ecommerce_image.product_understand'] },
      { id: 'copy_generate', title: '文案生成', description: '生成短卖点、词性标注和渲染样式策略，输出 copy.json 和 copy.md。', artifact: 'copy.md', promptIds: ['ecommerce_image.copy_generate'] },
      { id: 'main_image_beautify', title: '主图美化', description: '去除非商品文案、衬底、logo 和牛皮癣元素，输出 beautified.png 和 beautify_report.json，并登记中间 image 素材。', artifact: 'beautified.png', promptIds: ['ecommerce_image.main_image_beautify'] },
      { id: 'background_replace', title: '背景替换', description: '保持商品主体不变，替换并融合电商场景背景，输出 background_variant_<i>.png 和 backgrounds.json，并登记中间 image 素材。', artifact: 'backgrounds.json', promptIds: ['ecommerce_image.background_replace'] },
      { id: 'copy_render', title: '文案渲染', description: '先输出 render_plan.json，再按渲染计划稳定渲染文字，输出 final_<i>.png 和带质量元信息的 finals.json，并登记最终 image 素材。', artifact: 'finals.json', promptIds: ['ecommerce_image.copy_render'] },
    ],
  },
  lark_download: {
    type: 'lark_download',
    title: '飞书视频下载',
    description: '从飞书 wiki/docx 页面发现视频块并下载到任务产物目录或自定义输出目录。',
    nodes: [
      {
        id: 'download',
        title: '视频下载',
        description: '复用页面会话、发现视频块并输出 download-summary.json。',
        artifact: 'download-summary.json',
        promptIds: [],
      },
    ],
  },
  native: {
    type: 'native',
    title: '原生广告素材生成',
    description: '按游戏、短剧、小说、社交、工具、电商、网赚七类行业工作流生成投放素材。',
    nodes: [
      { id: 'industry_router', title: '行业路由', description: '加载行业策略、时长、必备模块和合规硬规则。', artifact: 'industry.json', promptIds: [] },
      { id: 'concept_planner', title: '概念规划', description: '按行业公式生成多条创意方向。', artifact: 'concepts.json', promptIds: ['native.concept_plan'] },
      { id: 'script_writer', title: '脚本生成', description: '把概念写成口播、字幕和节奏 beats。', artifact: 'scripts.json', promptIds: ['native.script_writer'] },
      { id: 'script_confirm', title: '脚本文案确认', description: '人工确认原生脚本文案后继续分镜和素材生成。', artifact: 'scripts.md', promptIds: [] },
      { id: 'storyboard_builder', title: '分镜构建', description: '拆成可用于视频生成的分镜和镜头提示词。', artifact: 'storyboard.json', promptIds: ['native.storyboard_builder'] },
      { id: 'compliance_pre', title: '前置合规', description: '执行行业硬规则，必要时改写脚本。', artifact: 'compliance_pre.json', promptIds: ['native.compliance_rewrite'] },
      { id: 'video_prompt_optimize', title: '视频提示词优化', description: '把行业分镜、参考策略和禁用文字约束整理为 Seedance 最终提示词。', artifact: 'video_prompts.json', promptIds: ['native.asset_generator'] },
      { id: 'asset_generator', title: '素材生成', description: '按优化后的提示词生成视频和可选口播音频素材。', artifact: 'assets.json', promptIds: [] },
      { id: 'consistency_checker', title: '一致性检测', description: '检测视频与行业模块、分镜和合规要求的一致性。', artifact: 'consistency.json', promptIds: ['native.consistency_checker'] },
      { id: 'composer', title: '成片入库', description: '命名、最终合规检查并写入素材库。', artifact: 'final_<i>.mp4', promptIds: ['native.composer_compliance'] },
    ],
  },
};

export function getDefaultWorkflowPrompts(): Record<WorkflowPromptId, string> {
  return Object.fromEntries(
    Object.entries(WORKFLOW_PROMPT_DEFINITIONS).map(([id, definition]) => [
      id,
      definition.defaultPrompt,
    ]),
  ) as Record<WorkflowPromptId, string>;
}

export function normalizeWorkflowPrompts(
  prompts: Partial<Record<string, string>> | undefined,
): Record<WorkflowPromptId, string> {
  const defaults = getDefaultWorkflowPrompts();
  if (!prompts) {
    return defaults;
  }
  for (const id of Object.keys(defaults) as WorkflowPromptId[]) {
    const value = prompts[id];
    if (typeof value === 'string' && value.trim()) {
      defaults[id] = value;
    }
  }
  return defaults;
}

export function renderWorkflowPrompt(
  id: WorkflowPromptId,
  prompts: WorkflowPromptOverrides | undefined,
  variables: Record<string, string | number>,
): string {
  const template = normalizeWorkflowPrompts(prompts)[id];
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key: string) => {
    const value = variables[key];
    return value === undefined ? match : String(value);
  });
}
