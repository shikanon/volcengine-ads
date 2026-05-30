import type { NativeIndustry, TaskType } from './types.js';

export const WORKFLOW_PROMPT_TEMPLATE_VERSION = '2026-05-30-seedance-router-v1';

export interface NativeIndustryDefinition {
  id: NativeIndustry;
  title: string;
  formula: string;
  durationRange: string;
  requiredModules: string[];
  complianceFocus: string;
}

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
};

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
  '参考素材策略：商品图优先保持外观、颜色、包装和文字不变形；人物图只参考长相、发型、服装和年龄感；参考视频只借主体位置、动作节奏、镜头连续性和衔接，不复制具体人物身份、场景和画面；无参考素材时必须基于脚本和分镜生成，不要声称参考了不存在的视频或图片。';

export const SEEDANCE_PROMPT_CARD_PROMPT =
  'SeedancePromptCard 正文必须包含 visualAnchor、behaviorState、localTone、videoTheme、referencePolicy、preservedConstraints、forbidden、repairHint；seedancePrompt 要能直接传给 Seedance 生成视频。';

export const AD_QUALITY_RUBRIC_PROMPT =
  '质量 Rubric：首秒停留、广告信息清晰度、画面完成度、参考一致性、差异化/首发潜力、合规安全性都要可判断；若质检失败，repairPrompt 必须能直接用于二次生成。';

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
      `${PRIVATE_REASONING_PROMPT}基于原视频理解、原文案与分镜裂变 {variantCount} 条。${AD_CREATIVE_STRUCTURE_PROMPT}${SEEDANCE_VC_ROUTER_PROMPT}${REFERENCE_POLICY_PROMPT}先生成完整新脚本，再把脚本拆成可用于视频生成的 storyboard。每条变体必须复用原片高转化结构，但更换钩子、场景或利益点表达，避免同质化。每个 visualPrompt 必须写成 Seedance 友好的视觉锚点、行为状态、局部调性和广告目的，不要堆叠低价值摄影参数。${VIDEO_COMPOSITION_PROMPT}${SEEDANCE_DIRECTOR_PROMPT}${AD_MATERIAL_QUALITY_PROMPT}必须保留 CTA 关键词：{ctaKeywords}\n只输出 JSON 数组，每项包含 {"index":1,"strategy":"shot_replace|avatar_replace|product_shot_replace|pretrailer_add|hot_opening_reuse|remix","copy":"...","script":"...","preserve":["结构/节奏/转化触发点"],"replace":["非核心画面/人物/场景/利益点表达"],"differenceTarget":"画面差异目标","variantReason":"该变体的差异化理由","storyboard":[{"index":1,"durationSec":4,"visualPrompt":"...","narration":"...","transition":"...","visualAnchor":"...","behaviorState":"...","localTone":"...","videoTheme":"..."}]}。\n原文案：{transcriptText}\n原片拆解：{scriptParseJson}`,
  },
  'explosion.seedance': {
    title: '视频生成',
    description: '把裂变脚本和分镜组装成 Seedance 视频生成 Prompt。',
    variables: ['copy', 'script', 'storyboard', 'referencePolicy'],
    defaultPrompt: `${SEEDANCE_VC_ROUTER_PROMPT}${SEEDANCE_PROMPT_CARD_PROMPT}\n裂变文案：{copy}\n\n完整脚本：{script}\n\n按以下分镜生成视频：\n{storyboard}\n\n参考素材使用方式：{referencePolicy}\n\n${VIDEO_COMPOSITION_PROMPT}${SEEDANCE_DIRECTOR_PROMPT}${AD_CREATIVE_STRUCTURE_PROMPT}${AD_MATERIAL_QUALITY_PROMPT}`,
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
      `${PRIVATE_REASONING_PROMPT}生成 {pretrailerDuration}s 广告前贴，视频生成类型：{videoType}。类型提示词模板：{style}必须把原片产品、场景、人物、色调、构图、镜头语言和光线质感融合进文案创意：{visualStyle}。${AD_CREATIVE_STRUCTURE_PROMPT}${PRETRAILER_CREATIVE_STRATEGY_PROMPT}${AD_MATERIAL_QUALITY_PROMPT}要求协调但差异化，1 秒内出现核心钩子，钩子必须能被画面直接表达。先内部比较不同 hook 方向，正文只输出 JSON：{"candidates":[{"hookType":"conflict|contrast|pain|spectacle|spoken_question","text":"...","hookAtSec":0.5,"firstSecondVisual":"首秒画面钩子","reason":"适合原因","riskNote":"合规风险规避说明"}],"selectedIndex":1,"text":"最终前贴文案","hookAtSec":0.5,"hookVisual":"最终首秒画面钩子","riskNote":"最终风险规避说明"}。`,
  },
  'pretrailer.script_gen': {
    title: '前贴分镜',
    description: '把前贴文案拆成短镜头脚本。',
    variables: ['pretrailerDuration', 'copyText', 'understandingJson'],
    defaultPrompt:
      `${PRIVATE_REASONING_PROMPT}为 {pretrailerDuration}s 广告前贴生成分镜。首镜头必须 <=1 秒，并承担停留钩子。${AD_CREATIVE_STRUCTURE_PROMPT}${PRETRAILER_CREATIVE_STRATEGY_PROMPT}${SEEDANCE_VC_ROUTER_PROMPT}每个镜头 prompt 必须写清楚产品、场景、人物、动作、色调、光线质感、情绪、前后景层次和节奏，并自然继承原片理解中的视觉元素；不使用原片关键帧作为生成参考。${VIDEO_COMPOSITION_PROMPT}${SEEDANCE_DIRECTOR_PROMPT}${AD_MATERIAL_QUALITY_PROMPT}文案：{copyText}。原片理解：{understandingJson}。只输出 JSON：{"firstSecondVisual":"0-1s 视觉钩子","transitionPlan":"前贴如何接原片","endingFramePrompt":"末帧衔接描述","shots":[{"index":1,"durationSec":1,"prompt":"...","visualAnchor":"...","behaviorState":"...","localTone":"...","videoTheme":"..."}]}。`,
  },
  'pretrailer.seedance': {
    title: '前贴生成',
    description: '把前贴分镜传给视频生成模型。',
    variables: ['scriptJson', 'referencePolicy'],
    defaultPrompt: `${SEEDANCE_VC_ROUTER_PROMPT}${SEEDANCE_PROMPT_CARD_PROMPT}\n前贴分镜 JSON：{scriptJson}\n\n参考素材使用方式：{referencePolicy}\n\n要求首帧必须强钩子，末帧必须能自然接原片。${VIDEO_COMPOSITION_PROMPT}${SEEDANCE_DIRECTOR_PROMPT}${AD_CREATIVE_STRUCTURE_PROMPT}${AD_MATERIAL_QUALITY_PROMPT}`,
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
      `${PRIVATE_REASONING_PROMPT}生成 {duration}s 转化型数字人口播脚本，短句化、可 TTS、自然停顿，至少 2 个产品差异化卖点，并规避禁用承诺。可内部比较痛点设问、福利利益、对比反差、轻剧情四类方向，正文只输出最终 JSON：{"text":"完整口播","hookType":"pain_question|benefit|contrast|micro_story","differentiators":["...","..."],"ttsNotes":"语速、停顿、情绪","avatarSceneType":"single_talking|product_overlay|picture_in_picture|desk_demo","timeline":[{"sellingPoint":"...","atSec":4,"productImageIndex":0,"visualAction":"产品如何露出"}],"riskControl":"..."}。品牌：{brandJson}。产品：{productJson}。产品图数量：{productImageCount}`,
  },
  'avatar.seedance_avatar': {
    title: '数字人生成',
    description: '控制数字人口播的视频生成风格。',
    variables: [],
    defaultPrompt: `${SEEDANCE_VC_ROUTER_PROMPT}基于参考音频驱动数字人口播，音频、唇形、人物一致性是硬约束，不要过度 Vibe 改写。保持正面清晰构图、自然唇形、可信表情、轻微手势、稳定眼神和干净广告背景；可按单人出镜、产品贴片、画中画、桌面讲解组织画面。${REFERENCE_POLICY_PROMPT}${VIDEO_COMPOSITION_PROMPT}`,
  },
  'native.concept_plan': {
    title: '行业概念规划',
    description: '按行业策略矩阵生成爆款广告创意方案。',
    variables: ['industryTitle', 'formula', 'durationRange', 'requiredModules', 'complianceFocus', 'brief', 'productName', 'variantCount', 'durationSec', 'ratio'],
    defaultPrompt:
      `${PRIVATE_REASONING_PROMPT}为{industryTitle}行业生成 {variantCount} 条原生爆款广告概念。行业公式：{formula}。目标时长：{durationSec}s，规格：{ratio}，行业建议时长：{durationRange}。必备模块：{requiredModules}。合规重点：{complianceFocus}。产品：{productName}。创意简报：{brief}。${AD_CREATIVE_STRUCTURE_PROMPT}${AD_MATERIAL_QUALITY_PROMPT}${AD_QUALITY_RUBRIC_PROMPT}只输出 JSON：{"concepts":[{"index":1,"title":"...","materialFormula":"行业公式如何落到本条素材","hook":"首秒可视化钩子","firstSecondHook":"0-1s 画面","audience":"...","sellingPoints":["..."],"proofPoint":"可信证据或使用场景","modules":["..."],"cta":"...","tone":"...","noveltyAngle":"差异化角度","commodityAssetFit":"商品/资产匹配说明","riskControl":"合规规避策略"}]}。`,
  },
  'native.script_writer': {
    title: '行业脚本生成',
    description: '把创意方案写成可投放广告脚本。',
    variables: ['industryTitle', 'brief', 'conceptsJson', 'durationSec'],
    defaultPrompt:
      `${PRIVATE_REASONING_PROMPT}基于{industryTitle}行业策略，把概念写成 {durationSec}s 原生广告脚本。${AD_CREATIVE_STRUCTURE_PROMPT}若总时长超过 15s，请按 Seedance 可生成片段规划节奏，每段 4-15s，例如 25s 拆为 15s + 10s。口播要短句化、可配音、避免堆砌形容词，CTA 自然但明确；证据点必须来自输入或合理使用场景，不编造不可证明承诺。创意简报：{brief}。概念：{conceptsJson}。只输出 JSON：{"scripts":[{"index":1,"title":"...","script":"完整口播/字幕脚本","voiceover":"可用于 TTS 的口播文本","cta":"...","hookType":"pain|benefit|conflict|spectacle|story","riskControl":"...","beats":[{"timeSec":0,"text":"首秒钩子"},{"timeSec":3,"text":"卖点或证据"}]}]}。`,
  },
  'native.storyboard_builder': {
    title: '分镜构建',
    description: '把脚本拆成视频生成可用分镜。',
    variables: ['industryTitle', 'ratio', 'scriptsJson', 'durationSec'],
    defaultPrompt:
      `${PRIVATE_REASONING_PROMPT}把{industryTitle}广告脚本拆成适合 Seedance 生成的分镜，视频比例 {ratio}，总时长约 {durationSec}s。若总时长超过 15s，请拆为多个连续片段，每段 4-15s，例如 25s 拆为 15s + 10s，并让 shots 的 durationSec 累计接近总时长。${SEEDANCE_VC_ROUTER_PROMPT}每个 videoPrompt 必须写清楚视觉锚点、行为状态、局部调性和广告目的，避免低价值摄影参数堆叠。${VIDEO_COMPOSITION_PROMPT}${SEEDANCE_DIRECTOR_PROMPT}${AD_CREATIVE_STRUCTURE_PROMPT}${AD_MATERIAL_QUALITY_PROMPT}${VIDEO_TEXT_STICKER_PROMPT}首镜头承担首秒钩子，后续镜头按痛点/爽点、卖点证据、CTA 推进。脚本：{scriptsJson}。只输出 JSON：{"variants":[{"index":1,"title":"...","script":"...","voiceover":"...","shots":[{"index":1,"durationSec":3,"shotType":"ai_pretrailer|digital_human|product_demo|atmosphere|cta","imagePrompt":"场景图提示词，包含主体、环境、光线、构图和质感","videoPrompt":"视频镜头提示词，不包含文字贴纸、花字、字幕或任何可读文字","visualAnchor":"...","behaviorState":"...","localTone":"...","videoTheme":"...","referencePolicy":"...","voiceoverText":"对应口播文本，仅供节奏参考","module":"行业必备模块"}]}]}。`,
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
      { id: 'seedance', title: '视频生成', description: '按优化后的提示词生成无音轨视频。', artifact: 'variant_<i>.mp4', promptIds: [] },
      { id: 'audio_replace', title: '音频替换', description: '复用原音频生成最终视频。', artifact: 'final_<i>.mp4', promptIds: [] },
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
      { id: 'seedance', title: '前贴生成', description: '按优化后的提示词生成无音轨前贴视频。', artifact: 'pretrailer.mp4', promptIds: [] },
      { id: 'tts', title: '语音合成', description: '合成前贴口播音频。', artifact: 'pretrailer.m4a', promptIds: [] },
      { id: 'mux_pretrailer', title: '前贴合成', description: '合并前贴音视频。', artifact: 'pretrailer_av.mp4', promptIds: [] },
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
  native: {
    type: 'native',
    title: '原生爆款广告素材生成',
    description: '按游戏、短剧、小说、社交、工具、电商六类行业工作流生成投放素材。',
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
