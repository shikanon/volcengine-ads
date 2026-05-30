# 广告素材生成流程与 Prompt 上下文工程优化方案

日期：2026-05-30

## 目标

基于飞书广告素材、Seedance 2.0、商品 x 素材策略、行业 AIGC 动态创意资料，优化 `volcengine-ads` 当前四条生成链路：

- `explosion`：广告爆款裂变
- `pretrailer`：广告前贴
- `native`：六行业原生广告素材生成
- `avatar`：数字人口播

核心目标不是简单“让视频更好看”，而是让模型稳定生成更接近真实投放场景的广告素材：首秒有钩子、表达清晰、行业公式正确、参考素材使用合理、同质化风险更低、后续可质检和可修复。

## 资料依据

本方案参考了以下飞书资料，内容均以方法论和流程摘要方式沉淀，不复刻原文：

| 资料 | 关键启发 |
|---|---|
| [Seedance 2.0 Vibe Creating 实践手册](https://bytedance.larkoffice.com/docx/FUHudm80VoGJRcxXykzcpNrQnj3) | Seedance 2.0 更适合用故事意图、视觉锚点、行为状态、情绪质感驱动；不要过度堆叠摄影参数。 |
| [Vibe Creating 提示词 Skill.md](https://bytedance.larkoffice.com/docx/AVJddCKUmoj6j7x08jbcRBzon8b) | 提供 Seedance Prompt 路由策略：先判断场景适配度、表达方式和信息密度，再决定直传、轻改、重写、追问或保留；硬约束、声音、对白、用户明确要求优先。 |
| [巨量代理 x 火山 Seedance 视频生成大模型共建方案](https://bytedance.larkoffice.com/docx/AEq5dEoNGoGG9Qx3K1bcVTTjntc) | Seedance 2.0 支持文本、图片、视频、音频多模态参考；参考素材必须明确“借什么、不借什么”。 |
| [爆款裂变产品策略及案例参考](https://bytedance.larkoffice.com/docx/GOLRdzgiHoSXhpxVkTvczDQqndc) | 爆款裂变的关键是保留爆款结构和高价值片段，替换非核心片段，控制同质化。 |
| [内容消费商品 x 素材策略投放方法论](https://bytedance.larkoffice.com/wiki/JRqNw1YZWiu2q2kfLJicBn6Xndf) | 投放系统更重视商品 x 素材组合，多样性、首发性和素材质量会影响跑量。 |
| [五大行业 AIGC 广告素材特点提炼](https://bytedance.larkoffice.com/docx/QYhhdQYiPoIsGJx3tupcuJiznud) | 各行业有稳定素材公式；AI 前贴、数字人口播、混剪、参考图 + 提示词是主流链路。 |
| [游戏 x AIGC 动态创意产品手册](https://bytedance.larkoffice.com/docx/If97dwa46oHutdxrljmcmRb0njg) | 游戏素材侧重玩法、福利、奖励高潮、吸睛片头和数字人贴片。 |
| [短剧 UBMax x AIGC 动态创意产品介绍](https://bytedance.larkoffice.com/docx/YnVMdWGj3os4pYx6CWYclfhOnSe) | 短剧素材侧重剧情高光、冲突、反转、爽点、黄金 3 秒和原片授权。 |
| [小说行业 AI 素材 x Seedance 2.0 实操指南](https://bytedance.larkoffice.com/wiki/SqcnwztOOirrFbkSLSEc9zGuntd) | 小说建议选 50-200 字高光片段，用 AI 前贴拼接解压或滚屏素材；参考图能显著提升人物一致性。 |
| [工具行业 x Seedance 2.0 视频生成探索](https://bytedance.larkoffice.com/wiki/IUgXw5UIViY6lPkcYpJc9hhLnOR) | 工具行业可公式化：痛点、口播、产品使用展示、权益/价格、行动指令。 |

## 当前代码映射

| 模块 | 当前工作流 | 主要优化点 |
|---|---|---|
| `explosion` | `download -> asr -> script_parse -> rewrite -> script_confirm -> seedance -> audio_replace` | 从“相似复刻”升级为“爆款结构解构 + 裂变策略选择 + 同质化规避”。 |
| `pretrailer` | `ingest -> understand -> copy_gen -> script_gen -> script_confirm -> seedance -> tts -> mux_pretrailer -> concat` | 强化 1 秒钩子、行业化前贴方向、尾帧衔接原片。 |
| `native` | `industry_router -> concept_planner -> script_writer -> script_confirm -> storyboard_builder -> compliance_pre -> asset_generator -> consistency_checker -> composer` | 固化六行业素材公式，让每个节点产出投放素材而不是泛视频。 |
| `avatar` | `validate_avatar -> product_understand -> brand_parse -> script_gen -> script_confirm -> tts -> seedance_avatar -> overlay -> postprocess` | 从普通数字人口播升级为转化型口播，支持贴片、画中画、单人出镜策略。 |

## 落地状态

更新时间：2026-05-30

| 模块 | 状态 | 代码位置 | 说明 |
|---|---|---|---|
| 公共 Prompt 契约 | 已完成 | `src/shared/workflows.ts` | 新增 `PRIVATE_REASONING_PROMPT`、`SEEDANCE_VC_ROUTER_PROMPT`、`REFERENCE_POLICY_PROMPT`、`SEEDANCE_PROMPT_CARD_PROMPT`、`AD_QUALITY_RUBRIC_PROMPT` 和模板版本 `2026-05-30-seedance-router-v1`。 |
| Context / Prompt helper | 已完成 | `src/main/pipelines/helpers.ts` | 新增 `buildReferencePolicyText` 与 `buildSeedancePromptCard`，统一生成参考素材策略和 SeedancePromptCard。 |
| `explosion` | 已完成 | `src/main/pipelines/explosion/index.ts` | `script_parse` / `rewrite` Prompt 支持高价值片段、可替换片段、裂变策略和差异化目标；`seedance` 动态注入参考策略，参考视频被拒时改用无参考 Prompt。 |
| `pretrailer` | 已完成 | `src/main/pipelines/pretrailer/index.ts` | 支持多候选 hook、首秒视觉钩子、尾帧衔接、SeedancePromptCard 和无关键帧参考生成。 |
| `native` | 已完成 | `src/main/pipelines/native/index.ts` | 概念、脚本、分镜、生成和质检均加入行业公式、私有分析、参考策略、SeedancePromptCard 和修复 Prompt 字段。 |
| `avatar` | 已完成 | `src/main/pipelines/avatar/index.ts` | 产品理解、品牌解析、转化型口播、数字人口播场景类型、音频/唇形硬约束和产品露出策略已接入。 |
| ModelClient reasoning options | 已完成 | `src/main/model-client/index.ts`、`src/main/model-client/volcengine.ts` | `chat` / `vision` / `visionVideo` 支持 `reasoningEffort` 选项透传入口；当前厂商不强行发送未知字段，默认仍通过 Prompt 约束内部分析。 |
| 工作流 UI | 已完成 | `src/renderer/pages/Workflows.tsx`、`src/renderer/styles.css` | Prompt 检查器展示模板版本、内部分析、Seedance Router、参考策略和质量 Rubric。 |
| 真实 smoke fallback | 已完成 | `scripts/live-volcengine-smoke.mjs` | Native smoke 支持 `LIVE_SMOKE_NATIVE_INDUSTRY` 单行业重跑；参考视频安全拒绝或下载失败时自动无参考重试，并在提交 Seedance 前清洗可读文字/字幕/Logo 指令。 |

### 验证记录

| 验证项 | 结果 | 说明 |
|---|---|---|
| `npm run typecheck` | 通过 | TypeScript 严格模式通过。 |
| `npm run lint` | 通过 | ESLint 通过。 |
| `npm test` | 通过 | 17 个测试文件、68 个测试全部通过。 |
| `npm run test:live:chat` | 通过 | 真实 LLM smoke 通过。 |
| `npm run test:live:features` | 通过 | 爆款裂变、广告前贴、数字人口播真实链路通过；爆款裂变覆盖参考视频被安全策略拒绝后的无参考 fallback。 |
| `npm run test:live:native` | 部分后修复通过 | 全量 native smoke 覆盖多行业真实链路；测试中暴露了参考视频 URL 下载失败和小说行业可读文字/字幕生成风险。 |
| `LIVE_SMOKE_NATIVE_INDUSTRY=ecommerce npm run test:live:native` | 通过 | 修复参考视频不可用 fallback 后，电商行业真实 smoke 通过。 |
| `LIVE_SMOKE_NATIVE_INDUSTRY=novel npm run test:live:native` | 通过 | 补充 live smoke 可读文字清洗和禁文字提示后，小说行业真实 smoke 通过。 |
| `npm run build` | 通过 | Vite 构建和 electron-builder `--dir` 打包通过；仅有常规 chunk size 与 macOS 签名提示。 |

### 未完成项与 Mock 审计

`src/`、`scripts/`、`docs/` 扫描了 `TODO`、`FIXME`、`mock`、`stub`、`fake`、`placeholder`、`未完成`、`待实现`、`临时`、`hardcoded`、`写死`。结论：

- 未发现生产代码中残留 mock/stub/fake 实现。
- 命中的 `placeholder` 均为前端输入框占位文案。
- `src/main/pipelines/codex-diagnosis.ts` 中的“Codex 诊断未完成”是失败诊断报告标题，不是未开发模块。
- 单测中的 mock 仅用于隔离外部 API 和 FFmpeg，符合测试要求。

## 总体优化原则

1. 从“生成视频”转为“生成可投放素材”。
2. 从“单段 prompt”转为“Context Pack + 分层 Prompt + 质量检查”。
3. 从“画面相似”转为“结构继承、画面差异、投放目标一致”。
4. 从“节点各自拼 prompt”转为“公共元提示 + 行业公式 + 节点模板”。
5. 从“生成完即结束”转为“生成、质检、修复建议”。

## Prompt 与上下文工程

Prompt 与上下文工程是本方案成败的核心。模型效果差通常不是因为某一句话写得不够华丽，而是因为上下文没有被正确组织：任务目标不清、参考素材不知道借什么、行业公式缺失、质量标准后置或缺失、输出结构不稳定。

### 1. 模型分工

| 模型/能力 | 角色 | 输入 | 输出 |
|---|---|---|---|
| VLM 视频理解 | 广告素材分析师 | 完整原片或生成结果 | 爆款结构、钩子、片段价值、风险、质检结果 |
| LLM | 创意策略编导 | Context Pack、行业公式、任务要求 | 脚本、分镜、前贴方案、Seedance Prompt |
| Seedance 2.0 | 视频导演和执行 | 导演式提示词、参考图、参考视频、音频 | 4-15 秒视频片段 |
| FFmpeg | 后期合成 | 片段、音频、字幕、原片 | 最终视频 |

### 2. Context Pack 设计

所有 LLM/VLM 调用前应构造统一上下文包，避免散乱拼接字符串。

```ts
interface AdMaterialContextPack {
  task: TaskBrief;
  source?: SourceMaterialCard;
  product?: ProductAssetCard;
  industry: IndustryFormulaCard;
  generation: GenerationSpec;
  quality: QualityRubric;
  constraints: PromptConstraints;
}
```

#### 2.1 Task Brief

说明这次任务到底要什么。

```json
{
  "taskType": "explosion | pretrailer | native | avatar",
  "industry": "game | short_drama | novel | social | tool | ecommerce",
  "outputGoal": "爆款裂变 | 广告前贴 | 原生素材 | 数字人口播",
  "ratio": "9:16",
  "durationSec": 15,
  "variantCount": 3
}
```

#### 2.2 Source Material Card

来自完整视频理解，不再用关键帧替代视频理解。

```json
{
  "coreStory": "原片讲了什么",
  "visualStyle": "人物、场景、色调、节奏、镜头风格",
  "hookFormula": "首秒为什么吸引人",
  "highValueSegments": [
    {
      "timeRange": "0-3s",
      "reason": "保留原因",
      "preserve": "结构 | 节奏 | 情绪 | 话术"
    }
  ],
  "replaceableSegments": [
    {
      "timeRange": "8-12s",
      "reason": "非核心展示，可替换为同义画面"
    }
  ],
  "conversionTriggers": ["痛点", "利益点", "信任背书", "行动指令"],
  "risks": ["同质化", "夸大承诺", "版权/授权", "低质画面"]
}
```

#### 2.3 Product / Asset Card

用于防止模型把产品、商品、人物关系生成跑偏。

```json
{
  "productName": "产品名",
  "productCategory": "工具/游戏/小说/短剧/电商等",
  "coreBenefits": ["核心卖点1", "核心卖点2"],
  "proofPoints": ["可证明的信息"],
  "forbiddenClaims": ["不能承诺的效果"],
  "targetAudience": "目标人群",
  "requiredVisualElements": ["必须出现的商品/界面/人物"],
  "optionalVisualElements": ["可选元素"]
}
```

#### 2.4 Industry Formula Card

行业公式统一维护，节点只引用，不散落复制。

| 行业 | 推荐公式 |
|---|---|
| 游戏 | 问题/悬念开篇 -> 福利/激励 -> 玩法/系统展示 -> 奖励高潮 -> CTA |
| 短剧 | 黄金 3 秒冲突 -> 反转/爽点 -> 悬念断点 -> 点击继续 |
| 小说 | 50-200 字高光片段 -> AI 前贴 -> 解压/滚屏拼接 -> 点击看书 |
| 社交 | 活人感场景 -> Vlog/采访/自拍 -> 轻口播 -> 低压转化 |
| 工具 | 用户痛点 -> 真人/数字人口播 -> 使用展示 -> 权益/价格 -> CTA |
| 电商 | 场景痛点 -> 商品卖点 -> 证据背书 -> 权益刺激 -> CTA |

#### 2.5 Generation Spec

给 Seedance 的生成硬约束。

```json
{
  "model": "Seedance 2.0",
  "durationSec": 8,
  "ratio": "9:16",
  "referenceImages": ["商品图", "人物图"],
  "referenceVideos": ["原片片段"],
  "referencePolicy": {
    "image": "商品图必须保持外观和文字不变形；人物图只参考长相与服饰",
    "video": "只参考主体位置、动作节奏、运镜连续性，不复制具体画面"
  },
  "audioPolicy": "Seedance 音效可保留，口播后续由 TTS 替换",
  "textPolicy": "除明确要求外，不在画面生成不可控文字"
}
```

#### 2.6 Quality Rubric

每条素材都按同一标准检查，输出可用于后续修复。

```json
{
  "hookScore": "0-100，首秒吸引力",
  "adClarityScore": "0-100，广告信息是否清楚",
  "visualQualityScore": "0-100，画面完成度",
  "referenceConsistencyScore": "0-100，参考图/视频是否正确使用",
  "originalityScore": "0-100，差异化和首发潜力",
  "complianceScore": "0-100，合规安全性",
  "repairSuggestions": ["可执行修复建议"]
}
```

### 3. 上下文优先级

当上下文冲突时，按以下顺序裁决：

1. 用户本次输入
2. 任务表单字段
3. 原片/素材理解结果
4. 行业公式
5. 全局广告素材规则
6. 默认审美规则

示例：用户明确要求“不生成数字人”，即使工具行业公式推荐口播，也应改用空镜、产品界面、真人场景替代。

### 4. LLM Prompt 模板

LLM 节点应统一采用结构化模板，强制 JSON 输出。

```text
你是广告素材创意编导，目标是生成可投放的信息流广告素材方案。

任务：
{task_brief}

上下文：
{source_material_card}
{product_asset_card}

行业公式：
{industry_formula_card}

生成要求：
{requirements}

质量标准：
{quality_rubric}

输出要求：
只输出 JSON，不要输出解释文本。
JSON schema:
{schema}

禁止：
- 不要编造没有依据的产品承诺。
- 不要复制原片具体画面，只继承结构、节奏和转化逻辑。
- 不要输出无法执行的抽象建议。
```

### 5. Seedance Prompt 模板

Seedance Prompt 不宜写成规则清单，应写成导演式画面描述。

```text
生成一条 {ratio} 竖版信息流广告视频，时长 {durationSec} 秒。
这条视频的广告目的：{outputGoal}。

画面核心视觉锚点是：{visualAnchor}。
开头 1 秒让观众立刻感到：{hookEmotion}。
主体正在发生的动作：{actionState}。
环境与光线：{environmentAndLighting}。
整体情绪和节奏：{moodAndRhythm}。
广告信息通过画面表达：{adMessage}。

参考素材使用方式：
{referencePolicy}

结尾要求：
{endingOrTransition}

避免：
- 不生成不可控大段文字。
- 不夸大产品效果。
- 不复制参考视频里的具体人物身份和场景。
```

### 6. Seedance 2.0 写法原则

#### 6.1 少堆参数，多写意图

不推荐：

```text
85mm f1.4，推轨速度 0.7x，色温 4200K，对比度 +10。
```

推荐：

```text
镜头缓慢靠近人物，让观众感到压迫；人物动作克制，但眼神明显失望，画面从热闹突然变安静。
```

#### 6.2 必须包含四层信息

每个视频生成 Prompt 至少包含：

- 视觉锚点：画面里最重要的人、物、场景。
- 行为状态：主体正在做什么。
- 局部调性：光线、色彩、节奏、材质、情绪。
- 广告目的：前贴、口播、商品展示、裂变、CTA。

#### 6.3 参考素材必须说明“借什么”

```text
参考图1：只参考人物长相、发型、服装，不参考背景。
参考视频1：只参考动作节奏、主体站位、镜头连续性，不复制人物身份和具体场景。
商品图1：必须保持商品外观、颜色、包装文字不变形。
```

#### 6.4 参考优先级

默认参考优先级：

1. 商品图：商品外观、颜色、文字、包装不能变形。
2. 人物图：人物长相、年龄感、发型、服饰保持一致。
3. 参考视频：只借动作、节奏、机位、衔接。
4. 文本风格：用于补充氛围和创意方向。

### 7. Seedance Prompt Router

参考 Vibe Creating 提示词策略，Seedance Prompt 不应由业务节点直接拼成长段文本，而应先经过一个轻量路由器。路由器的作用不是把所有广告都“文艺化”，而是判断当前任务适合 Seedance 如何理解，再输出可执行的 `SeedancePromptCard`。

#### 7.1 私有判断维度

以下判断放在模型内部分析中完成，不作为最终正文输出给用户，也不写入普通产物文本：

| 判断维度 | 用途 | 处理方式 |
|---|---|---|
| 场景适配度 | 判断是否天然适合 Seedance Vibe Creating | 剧情、人物情绪、氛围、动态场景适配度高；UI 教程、精确参数演示适配度低。 |
| 表达方式 | 判断输入是自然画面描述、混合描述，还是过度技术控制 | 自然描述直接优化；混合描述保留有效视觉意图；纯参数语言转译为观众感受。 |
| 信息密度 | 判断是否缺少主体、动作、场景、情绪、广告目的 | 足够则生成；不足则最小追问或用业务上下文补齐。 |
| 硬约束 | 判断用户明确要求、对白、旁白、音乐、音效、结构是否必须保留 | 明确保留，不为“优化 Prompt”而改写。 |

#### 7.2 路由动作

| 动作 | 触发条件 | 处理结果 |
|---|---|---|
| `direct_pass` | 输入已经是清晰的 Seedance 画面描述 | 只补参考素材策略、广告目的和风险约束。 |
| `light_refine` | 输入基本可用，但缺少局部调性或转化目标 | 小幅增强视觉锚点、行为状态、情绪和节奏。 |
| `direct_rewrite` | 输入是广告概念、脚本、分镜或口播，需要转成视频生成描述 | 改写为导演式画面，不复制原文案结构。 |
| `ask_missing_info` | 缺主体、场景、动作、产品或时长等关键条件 | 返回最少问题，避免一次追问过多。 |
| `keep_original` | UI 操作教程、精确功能演示、唇形同步等高约束场景 | 保留原意，只加必要生成限制。 |
| `optional_vc_version` | 用户给的是精确控制语言，但可转成情绪体验 | 同时产出保守版和 Vibe 版，供策略层选择。 |

#### 7.3 正文输出契约

最终给 pipeline 使用的正文只保留可执行结果，不输出推理链：

```json
{
  "seedancePrompt": "可直接传给 Seedance 的导演式提示词",
  "visualAnchor": "主体/商品/人物/场景锚点",
  "behaviorState": "主体动作和状态",
  "localTone": "光线、色彩、材质、情绪、节奏",
  "videoTheme": "广告目的和应用场景",
  "referencePolicy": "参考图、参考视频、音频分别借什么、不借什么",
  "preservedConstraints": ["必须保留的对白/旁白/音乐/结构/参数"],
  "forbidden": ["不生成内容"],
  "repairHint": "若失败，可用于二次修复的最小提示"
}
```

#### 7.4 镜头语言降噪规则

Seedance 2.0 不应被低价值摄影参数绑死。Prompt 生成时按以下规则处理：

- 删除或降权：焦段毫米数、光圈、快门、曝光值、设备型号、轨道速度、过细的机位术语、无业务意义的镜头编号。
- 保留并转译：能表达观众感受的镜头语言，例如“压迫感”“疏离感”“突然安静”“跟随人物慌张移动”。
- 必须保留：用户明确要求的画幅、时长、对白、旁白、音乐、音效、字幕策略、产品露出、品牌限制。
- 广告优先：画面氛围服务于首秒停留、卖点清晰、转化触发和合规安全，不为风格牺牲广告信息。

#### 7.5 典型场景路由

| 场景 | 推荐路由 | 说明 |
|---|---|---|
| 爆款裂变分镜 | `direct_rewrite` | 保留爆款结构和转化逻辑，重写视觉锚点和局部调性，降低同质化。 |
| 广告前贴 | `light_refine` 或 `direct_rewrite` | 首秒钩子和尾帧衔接优先，避免生成和原片割裂的炫技镜头。 |
| 六行业原生素材 | `direct_rewrite` | 先用行业公式形成脚本，再转为 SeedancePromptCard。 |
| 数字人口播 | `keep_original` 或 `light_refine` | 唇形、音频、人物一致性是硬约束，不应过度改写。 |
| 工具 UI 功能演示 | `keep_original` | 精确 UI 步骤比氛围更重要，Seedance 只负责包装性画面。 |
| 小说/短剧情绪高光 | `direct_rewrite` | 适合使用人物状态、情绪张力、环境质感驱动。 |

### 8. VLM 私有推理与正文输出

VLM 解读视频时，应该充分利用模型的内部分析能力，但不能把思维链当作产物输出。设计原则是：逻辑分析、时间轴拆解、广告策略判断、风险识别放在模型内部完成；正文只输出稳定 JSON，供后续节点消费。

#### 8.1 通用 VLM Prompt 结构

```text
请先在内部完成逐步分析，不要输出分析过程：
1. 按时间轴理解画面、声音、字幕、动作和转场。
2. 判断首秒钩子、转化触发点、卖点证据、CTA 和情绪曲线。
3. 区分必须保留的高价值结构与可替换的非核心画面。
4. 识别同质化、合规、商品变形、人物不一致、信息不清等风险。
5. 思考这条素材在投放场景中的行业公式和优化方向。

正文只输出 JSON，不要输出推理过程、不要输出解释文本。
```

#### 8.2 输出分层

| 层级 | 内容 | 是否落盘 |
|---|---|---|
| 内部分析 | 时间轴推理、业务判断、风险权衡、策略选择 | 不落盘，不展示，不进入后续 Prompt。 |
| 结构化正文 | `hookFormula`、`highValueSegments`、`replaceableSegments`、`referencePolicy`、`riskNotes` | 落盘为 JSON artifact。 |
| 修复正文 | 质检失败后的 `issues`、`repairPrompt`、`regeneratePolicy` | 落盘并传给二次生成。 |

#### 8.3 ModelClient 支持策略

当前 `ModelClient.chat` 只有 `temperature` 和 `jsonSchema`，`visionVideo` 也没有独立 reasoning 参数。因此开发分两步：

1. 第一阶段通过 Prompt 明确“内部分析，不输出推理链；正文只输出 JSON”，并用单测约束默认 Prompt 包含该指令。
2. 第二阶段如果模型 API 支持独立 thinking/reasoning channel，再扩展 `ChatOptions` / `VisionOptions`，把 `reasoningEffort`、`thinking` 等能力放到模型适配层，不让 pipeline 直接依赖厂商参数。

#### 8.4 禁止事项

- 不要求模型输出“详细思考过程”“逐步推理文本”。
- 不把内部分析字段塞进 `script_parse.json`、`understanding.json` 或质检 JSON。
- 不把内部路由标签暴露给最终用户；如需调试，只记录模板版本、节点 ID 和结构化结果。
- 不让后续 LLM 依赖未落盘的内部分析，只依赖结构化正文。

## 模块优化方案

### 1. 爆款裂变 `explosion`

#### 1.1 问题

- 生成逻辑容易变成“相似视频”，但真实投放需要“保留爆款结构、替换非核心片段”。
- 缺少显式裂变策略：分镜替换、人物替换、商品分镜替换、前贴新增、爆款开头复用、重新混剪。
- 缺少同质化目标和首发目标。

#### 1.2 优化策略

`script_parse` 输出爆款解构：

```json
{
  "coreStory": "原片内容摘要",
  "hookFormula": "首秒钩子公式",
  "structure": ["开头", "痛点", "卖点", "证明", "CTA"],
  "highValueSegments": [],
  "replaceableSegments": [],
  "conversionTriggers": [],
  "similarityRisk": "low | medium | high"
}
```

`rewrite` 输出裂变策略：

```json
{
  "strategy": "shot_replace | avatar_replace | product_shot_replace | pretrailer_add | hot_opening_reuse | remix",
  "preserve": ["脚本结构", "节奏", "转化触发点"],
  "replace": ["非核心片段", "场景", "人物", "商品展示方式"],
  "differenceTarget": "差异画面 >= 60%，首发目标 >= 90%",
  "variants": []
}
```

`seedance` 生成时强调：

- 保留爆款结构，不复制画面。
- 参考原片主体位置、动作节奏、镜头连续性。
- 明确替换的视觉元素。
- 明确差异化目标。

#### 1.3 质量检查

```json
{
  "hookScore": 0,
  "structureRetentionScore": 0,
  "visualDifferenceScore": 0,
  "conversionScore": 0,
  "complianceScore": 0,
  "repairPrompt": ""
}
```

### 2. 广告前贴 `pretrailer`

#### 2.1 问题

- 前贴最关键的是 1 秒内钩子和与原片自然衔接，当前 Prompt 还需要更强约束。
- 不同行业前贴方向差异明显，需要在 `copy_gen` 阶段生成多候选方向。

#### 2.2 优化策略

`understand` 输出：

```json
{
  "productOrStoryAnchor": "产品/故事锚点",
  "visualStyle": "原片视觉风格",
  "audiencePain": "目标痛点",
  "openingContext": "原片开头语义",
  "transitionNeeds": "前贴如何接原片"
}
```

`copy_gen` 输出多个候选：

```json
{
  "candidates": [
    {
      "hookType": "conflict | contrast | pain | spectacle | spoken_question",
      "text": "前贴文案",
      "firstSecondVisual": "首秒画面",
      "reason": "为什么适合",
      "riskNote": "合规风险"
    }
  ]
}
```

`script_gen` 强制结构：

- 0-1 秒：视觉钩子。
- 1-3 秒：冲突、痛点或反差解释。
- 3 秒后：向原片产品、人物、故事或场景收束。

#### 2.3 Seedance Prompt 要点

- 首帧必须强钩子。
- 末帧必须能接原片。
- 不要生成和原片割裂的炫技镜头。
- 前贴可以差异化，但产品/故事锚点不能丢。

### 3. 六行业原生生成 `native`

#### 3.1 问题

- 行业路由已存在，但行业公式还需更深入进入 `concept_planner`、`script_writer`、`storyboard_builder` 和 `asset_generator`。
- 需要让输出从“行业视频”升级为“行业投放素材”。

#### 3.2 行业公式

游戏：

```text
问题/悬念开篇 -> 福利/激励 -> 玩法/系统展示 -> 奖励高潮 -> CTA
```

短剧：

```text
黄金 3 秒冲突 -> 反转/爽点 -> 悬念断点 -> 点击继续
```

小说：

```text
50-200 字高光片段 -> AI 前贴 -> 解压/滚屏拼接 -> 点击看书
```

社交：

```text
活人感场景 -> Vlog/采访/自拍 -> 轻口播 -> 低压转化
```

工具：

```text
用户痛点 -> 真人/数字人口播 -> 使用展示 -> 权益/价格 -> CTA
```

电商：

```text
场景痛点 -> 商品卖点 -> 证据背书 -> 权益刺激 -> CTA
```

#### 3.3 节点优化

`concept_planner` 输出：

```json
{
  "materialFormula": "行业公式",
  "targetAudience": "目标人群",
  "firstSecondHook": "首秒钩子",
  "noveltyAngle": "差异化角度",
  "commodityAssetFit": "商品/资产匹配说明"
}
```

`storyboard_builder` 输出片段类型：

- AI 前贴片段
- 数字人口播片段
- 产品展示片段
- 空镜/奇观片段
- CTA 片段

`asset_generator` 使用参考素材：

- 人物一致性：人物参考图优先。
- 动作节奏：参考视频优先。
- 产品外观：商品图优先。
- 氛围风格：文本描述和风格图辅助。

### 4. 数字人口播 `avatar`

#### 4.1 问题

- 当前数字人口播偏“形象 + 脚本 + 生成”，但广告转化需要更短、更强、更可信。
- 需要支持贴片、画中画、单人出镜三类结构。

#### 4.2 优化策略

`brand_parse` 输出：

```json
{
  "oneLineBenefit": "一句话卖点",
  "audiencePain": "用户痛点",
  "proofPoints": [],
  "forbiddenClaims": [],
  "tone": "可信/亲切/专业/轻松"
}
```

`script_gen` 生成多版：

- 痛点设问版
- 福利利益版
- 对比反差版
- 轻剧情版

`seedance_avatar` 明确：

- 年龄、职业、气质。
- 半身/全身/画中画。
- 手势动作。
- 背景场景。
- 眼神直视镜头。
- 口播节奏自然。

## Prompt 与上下文工程扫描清单

本次扫描范围覆盖 `src/shared/workflows.ts`、四条 pipeline、ModelClient 接口、通用 helper、工作流 UI 和单测。优先级含义：P0 是会直接决定生成效果和稳定性的核心 Prompt 契约；P1 是影响可维护性、修复链路和后续扩展的工程支撑；P2 是体验和观测能力。

| 位置 | 当前作用 | 主要问题 | 优化动作 | 优先级 |
|---|---|---|---|---|
| `src/shared/workflows.ts:63-79` | 公共 Prompt 常量 | `SEEDANCE_DIRECTOR_PROMPT` 强调构图、镜头运动、景别等技术项，容易和 Seedance Vibe Creating 的“少参数、多意图”冲突。 | 拆成 `PRIVATE_REASONING_PROMPT`、`SEEDANCE_VC_ROUTER_PROMPT`、`REFERENCE_POLICY_PROMPT`、`AD_QUALITY_RUBRIC_PROMPT`，降低低价值镜头参数权重。 | P0 |
| `src/shared/workflows.ts:81-217` | 所有节点默认 Prompt | 节点 Prompt 直接拼公共常量，缺少 Context Pack、Prompt Router、私有推理约束和统一 JSON schema。 | 为每个 Prompt 增加 Context Pack 输入、正文 JSON schema、参考素材策略、禁止输出推理链约束。 | P0 |
| `src/main/pipelines/helpers.ts:29-34` | `workflowPrompt` 模板渲染 | 只做字符串变量替换，无法注入统一上下文包、模板版本、参考优先级和质量标准。 | 新增 `buildAdMaterialContextPack`、`renderAdWorkflowPrompt`，保留现有函数兼容老模板。 | P0 |
| `src/main/pipelines/helpers.ts:37-54` | JSON 解析 | 只提取 JSON，没有 schema 校验和字段修复策略。 | 增加 schema 验证或最小字段守卫；错误信息带节点 ID、Prompt 版本和原始片段摘要。 | P1 |
| `src/main/model-client/index.ts:9-11` | `chat`、`vision`、`visionVideo` 调用接口 | `visionVideo` 无 options，无法显式传 JSON schema、temperature 或 reasoning effort。 | 第一阶段用 Prompt 约束私有分析；第二阶段新增 `VisionOptions`，统一支持 `jsonSchema`、`temperature`、`reasoningEffort`。 | P1 |
| `src/main/model-client/index.ts:21-29` | Seedance 请求 | 请求只有 `prompt`、参考素材和基础生成参数，没有结构化记录参考策略。 | 先把 `referencePolicy` 写进 Prompt；后续可在 artifact 中保存 `SeedancePromptCard`，便于质检和回放。 | P1 |
| `src/main/pipelines/explosion/index.ts:216-235` | 爆款原片 VLM 理解 | 当前只要求拆脚本、钩子、节奏、CTA，缺少高价值片段、可替换片段、同质化风险和参考策略。 | `script_parse` 增加私有分析指令，正文输出 `highValueSegments`、`replaceableSegments`、`similarityRisk`、`referencePolicy`。 | P0 |
| `src/main/pipelines/explosion/index.ts:238-264` | 裂变改写 | system prompt 只要求输出 `index/copy/script/storyboard`，没有显式裂变策略和差异目标。 | 增加 `strategy`、`preserve`、`replace`、`differenceTarget`、`variantReason`，每条 variant 选择不同 hook/场景/利益点。 | P0 |
| `src/main/pipelines/explosion/index.ts:166-180` | 分镜转 Seedance 文本 | `buildStoryboardPrompt` 只是拼 segment 和 shot，未体现 Prompt Router 输出。 | 增加 `SeedancePromptCard` 构造，把每段 shot 转成视觉锚点、行为状态、局部调性、广告目的和参考策略。 | P0 |
| `src/main/pipelines/explosion/index.ts:304-352` | 裂变视频生成 | 有参考视频回退，但 Prompt 没有随 `refVideoPath` 可用性调整“借什么”。 | 若有参考视频，强调只借节奏/站位/衔接；若无参考视频，自动删除“参考原片视频”的描述，改为基于脚本和分镜生成。 | P0 |
| `src/main/pipelines/pretrailer/index.ts:13-29` | 前贴中间类型 | `Understanding`、`PretrailerCopy`、`PretrailerScript` 字段偏少，不足以支撑强钩子和尾帧衔接。 | 增加 `hookFormula`、`openingContext`、`transitionNeeds`、`endingFrameContext`、`candidates`、`transitionPlan`。 | P0 |
| `src/main/pipelines/pretrailer/index.ts:38-54` | 原片理解 | 缺少私有业务分析和“原片开头如何被前贴承接”的结构化输出。 | VLM 内部分析原片开头、产品/故事锚点、受众痛点，正文只输出前贴可用 JSON。 | P0 |
| `src/main/pipelines/pretrailer/index.ts:57-79` | 前贴文案 | 当前只生成单条文案，容易单点失败。 | 生成 3-5 个候选，覆盖冲突、反差、痛点、奇观、设问等 hookType，再选择 top candidate。 | P0 |
| `src/main/pipelines/pretrailer/index.ts:81-112` | 前贴分镜和生成 | 对 0-1 秒、1-3 秒和尾帧衔接约束不够强。 | `script_gen` 输出时间段结构和 `endingFramePrompt`；`seedance` 使用 SeedancePromptCard，确保首帧强钩子、末帧可接原片。 | P0 |
| `src/main/pipelines/pretrailer/index.ts:131-140` | 前贴拼接 | 目前后期只做拼接/淡入淡出，不使用策略层的尾帧信息。 | 先保留 FFmpeg 逻辑；后续让 `transitionPlan` 决定是否需要首帧截取、淡入时长或黑场规避。 | P2 |
| `src/main/pipelines/native/index.ts:436-501` | 概念、脚本、分镜生成 | 行业公式进入了 Prompt，但还不够细化到首秒钩子、片段类型、参考策略和 Seedance 路由。 | `concept_planner` 输出素材公式；`script_writer` 输出短句口播；`storyboard_builder` 输出 `SeedancePromptCard` 所需字段。 | P0 |
| `src/main/pipelines/native/index.ts:543-740` | 原生素材生成 | Prompt 由脚本和分镜直接拼接，参考图/参考视频回退后 Prompt 不够动态。 | 用 `referencePolicyText` 根据实际输入生成；每个 segment 单独声明视觉锚点、行为状态、局部调性、广告目的。 | P0 |
| `src/main/pipelines/native/index.ts:1009-1036` | VLM 一致性检查 | 质检输出分数较粗，缺少可直接重生成的修复 Prompt。 | 增加私有分析指令；正文输出 `scores`、`issues`、`repairPrompt`、`regeneratePolicy`、`referenceMismatch`。 | P0 |
| `src/main/pipelines/avatar/index.ts:145-170` | 数字人图片和产品图理解 | 校验和产品理解偏视觉可用性，缺少广告卖点和不可生成风险。 | 产品理解增加 `visibleProofPoints`、`forbiddenClaims`、`requiredVisualElements`；头像校验增加口播可信感和遮挡风险。 | P1 |
| `src/main/pipelines/avatar/index.ts:177-223` | 品牌解析和口播脚本 | 口播脚本只校验差异化卖点数量，缺少行业化 hook、短句节奏、合规禁用承诺。 | `brand_parse` 增加痛点、证据、禁用承诺；`script_gen` 输出多版短口播、TTS 节奏和产品露出时间轴。 | P0 |
| `src/main/pipelines/avatar/index.ts:295-312` | 数字人视频生成 | 多段生成只强调连续性，未区分贴片、画中画、单人出镜等广告结构。 | `seedance_avatar` 增加 `avatarSceneType`、手势、眼神、背景、产品露出策略；长视频分段继承同一 Prompt Card。 | P1 |
| `src/renderer/pages/Workflows.tsx` | 工作流配置 UI | 可编辑 Prompt，但用户难以理解模板版本、参考策略和质量标准影响。 | 展示 Prompt 模板版本、行业公式、参考素材策略、质量 Rubric；高级编辑放在折叠区。 | P2 |
| `tests/unit/pipeline-contract.test.ts` | Prompt 契约测试 | 当前测试公共常量存在，但不覆盖私有推理约束、Prompt Router、参考策略字段。 | 增加断言：VLM Prompt 包含“内部分析、不输出推理链”；Seedance Prompt 包含四层信息和参考策略。 | P0 |
| `tests/unit/*pipeline*.test.ts` | 各 pipeline 单测 | 目前多围绕 step 顺序和基础参数，缺少 Prompt 字段和生成策略验证。 | 按模块补充高价值字段、候选 hook、SeedancePromptCard、reference fallback、repairPrompt 的单测。 | P1 |

## 公共质量检查与修复

生成后应通过 VLM 做一次素材质检。

```text
请作为广告素材质检员观看视频。
请先在内部分析首秒钩子、广告信息清晰度、画面质量、参考素材一致性、差异化、合规风险和可修复方式。
不要输出内部分析过程。
只输出 JSON：
{
  "pass": true,
  "scores": {
    "hook": 0,
    "adClarity": 0,
    "visualQuality": 0,
    "referenceConsistency": 0,
    "originality": 0,
    "compliance": 0
  },
  "issues": [],
  "repairPrompt": "如果需要重生成，给出可直接用于 Seedance 的修复提示词"
}
```

修复 Prompt 必须具体：

- 错误：人物不一致。
- 修复：更明确引用人物图，并限制年龄、发型、服装。
- 错误：首秒弱。
- 修复：把冲突动作提前到 0-1 秒。
- 错误：商品变形。
- 修复：强调商品图只可轻微位移，包装文字和轮廓不能变。

## 开发计划

### 阶段零：Prompt 扫描与契约冻结

目标：先把“哪些 Prompt 要改、改成什么结构、哪些字段算契约”固定下来，避免直接改业务代码导致回归难定位。

开发任务：

- 在本文档维护 `Prompt 与上下文工程扫描清单`，作为本轮优化范围。
- 在 `tests/unit/pipeline-contract.test.ts` 增加 Prompt 契约断言：
  - VLM 节点包含“内部分析，不输出推理链，只输出 JSON”。
  - Seedance 节点包含视觉锚点、行为状态、局部调性、广告目的四层信息。
  - 参考素材策略明确“借什么、不借什么”。
- 不改 pipeline 行为，只先补契约测试的预期描述，确认当前缺口。

验收：

- 扫描清单覆盖四条链路和公共层。
- 测试能指出当前 Prompt 缺少哪些关键能力。

### 阶段一：公共 Prompt、Context Pack 与 Seedance Router

目标：先建立公共能力，避免每条 pipeline 重复拼 Prompt，也避免每个模块对 Seedance 写法各自理解。

开发任务：

- 在 `src/shared/workflows.ts` 增加公共元提示：
  - `PRIVATE_REASONING_PROMPT`：内部分析、不输出推理链、正文只输出 JSON。
  - `SEEDANCE_VC_ROUTER_PROMPT`：基于 Vibe Creating 的直传、轻改、重写、追问、保留策略。
  - `REFERENCE_POLICY_PROMPT`：参考图、参考视频、音频的优先级和边界。
  - `AD_QUALITY_RUBRIC_PROMPT`：首秒、清晰度、质量、一致性、差异化、合规评分。
- 在 `src/main/pipelines/helpers.ts` 增加 Context Pack helper：
  - `buildTaskBrief`
  - `buildReferencePolicyText`
  - `buildSeedancePromptCard`
  - `renderPromptWithContext`
- 保留现有 `workflowPrompt` 兼容接口，分模块逐步迁移。
- 如果不新增数据库持久化，暂不修改 `spec.md`；若要持久化 Prompt 版本，再按 AGENTS 规则先改 `spec.md` 和 migration。

测试：

- `tests/unit/pipeline-contract.test.ts` 覆盖公共 Prompt 常量。
- helper 单测覆盖参考视频存在/不存在、参考图存在/不存在、长时长拆段场景。

验收：

- 四条链路的 VLM Prompt 都有私有分析约束。
- 四条链路的 Seedance Prompt 都能生成 `SeedancePromptCard` 所需字段。
- 参考视频策略明确“只参考动作、节奏、主体位置、镜头衔接”，且 fallback 时不再错误宣称有参考视频。

### 阶段二：爆款裂变 `explosion`

目标：从“相似复刻”升级为“爆款结构解构 + 裂变策略选择 + 差异化生成”。

开发任务：

- 升级 `ScriptParse` 类型和 `explosion.script_parse` Prompt：
  - 增加 `hookFormula`、`highValueSegments`、`replaceableSegments`、`conversionTriggers`、`similarityRisk`、`referencePolicy`。
  - VLM 先内部分析时间轴、转化逻辑和可替换画面，正文只输出 JSON。
- 升级 `Variant` 类型和 `explosion.rewrite` Prompt：
  - 增加 `strategy`、`preserve`、`replace`、`differenceTarget`、`variantReason`。
  - 支持 `shot_replace`、`avatar_replace`、`product_shot_replace`、`pretrailer_add`、`hot_opening_reuse`、`remix`。
- 改造 `buildStoryboardPrompt`：
  - 输出 `SeedancePromptCard` 风格文本。
  - 每段明确视觉锚点、行为状态、局部调性、广告目的和参考策略。
- 改造 `runSeedance`：
  - 有参考视频时只借动作/节奏/站位/衔接。
  - 无参考视频 fallback 时删除参考视频相关表述。

测试：

- `tests/unit/explosion-pipeline.test.ts` 覆盖新字段解析、CTA 保留、裂变策略、参考视频 fallback。
- 契约测试覆盖 Prompt 包含差异化目标和同质化规避。

验收：

- `script_parse.json` 能明确哪些片段保留、哪些片段替换。
- `variants.json` 每条都有裂变策略和差异化目标。
- 生成 Prompt 不复制原片画面，但保留爆款结构和转化逻辑。

### 阶段三：广告前贴 `pretrailer`

目标：生成高钩子、能自然接原片、适合行业投放的广告前贴。

开发任务：

- 升级 `Understanding`：
  - 增加 `productOrStoryAnchor`、`hookFormula`、`openingContext`、`transitionNeeds`、`endingFrameContext`、`riskNotes`。
- 升级 `copy_gen`：
  - 从单候选改为 3-5 个候选。
  - 候选覆盖 `conflict`、`contrast`、`pain`、`spectacle`、`spoken_question` 等 hookType。
  - 输出 top candidate 和选择理由，但不输出推理链。
- 升级 `script_gen`：
  - 强制 `0-1s` 首秒视觉钩子、`1-3s` 痛点或反差解释、结尾收束到原片。
  - 输出 `transitionPlan` 和 `endingFramePrompt`。
- 升级 `seedance`：
  - 使用 Seedance Prompt Router。
  - 首帧强钩子、末帧可接原片，避免和原片视觉体系割裂。

测试：

- `tests/unit/pretrailer-pipeline.test.ts` 覆盖多候选 hook、首秒钩子、尾帧衔接、无关键帧依赖。
- 契约测试覆盖 `pretrailer.understand` 和 `pretrailer.script_gen` 的私有分析约束。

验收：

- `copy.json` 有多个候选或明确 top candidate。
- `script.json` 包含 `firstSecondVisual` 和 `transitionPlan`。
- 前贴 Prompt 明确最后一秒如何接原片。

### 阶段四：六行业原生生成 `native`

目标：让行业公式贯穿概念、脚本、分镜、生成和质检，而不是只停留在开头 Prompt。

开发任务：

- 升级 `concept_planner`：
  - 输出 `materialFormula`、`targetAudience`、`firstSecondHook`、`noveltyAngle`、`commodityAssetFit`。
  - 六行业公式细化为可执行模块。
- 升级 `script_writer`：
  - 强化短句、TTS 友好、证据点、禁用承诺。
  - 游戏、短剧、小说、社交、工具、电商分别约束不同脚本节奏。
- 升级 `storyboard_builder`：
  - 每个 shot 增加 `shotType`、`visualAnchor`、`behaviorState`、`localTone`、`videoTheme`、`referencePolicy`。
  - 对超过 15 秒的视频保留多段连续性描述。
- 升级 `asset_generator`：
  - 基于实际输入生成 `referencePolicyText`。
  - 每个 segment 使用 SeedancePromptCard，而不是直接拼 `script + storyboard`。
- 升级 `consistency_checker`：
  - VLM 内部分析，正文输出 `scores`、`issues`、`repairPrompt`、`regeneratePolicy`。

测试：

- `tests/unit/native-pipeline.test.ts` 覆盖六行业公式、首秒钩子、参考策略、长时长拆段、质检修复 Prompt。
- 契约测试覆盖 `native.storyboard_builder` 不再强制低价值镜头参数。

验收：

- 每个行业都有明确素材公式和首秒 hook。
- 每个生成片段能说明广告目的和参考素材策略。
- 质检失败时能产出可直接用于二次生成的修复 Prompt。

### 阶段五：数字人口播 `avatar`

目标：让数字人口播成为转化型广告素材，而不是普通讲解视频。

开发任务：

- 升级 `avatar.product_understand`：
  - 增加 `visibleProofPoints`、`requiredVisualElements`、`forbiddenClaims`、`visualRisks`。
- 升级 `avatar.brand_parse`：
  - 输出 `oneLineBenefit`、`audiencePain`、`proofPoints`、`forbiddenClaims`、`tone`。
- 升级 `avatar.script_gen`：
  - 生成痛点设问版、福利利益版、对比反差版、轻剧情版。
  - 控制短句、停顿、TTS 可读性和产品图露出时间轴。
- 升级 `avatar.seedance_avatar`：
  - 增加 `avatarSceneType`：单人出镜、产品贴片、画中画、桌面讲解。
  - 约束人物可信感、眼神、手势、背景、节奏。
  - 长时长分段时继承同一角色和场景策略。

测试：

- `tests/unit/avatar-pipeline.test.ts` 覆盖口播长度、至少两类卖点、产品露出时间轴、长视频分段一致性。
- 契约测试覆盖数字人口播不走过度 Vibe 改写，优先保留唇形和音频硬约束。

验收：

- `script.json` 输出短促明确的转化型口播。
- Prompt 能按输入选择不同数字人口播场景类型。
- 长视频多段生成时人物身份、机位、光线和表情连续。

### 阶段六：工作流 UI 与模板版本

目标：让 Prompt 方案可见、可调、可回滚。

开发任务：

- 在工作流配置 UI 展示：
  - 行业公式
  - 素材目标
  - 参考素材策略
  - 质量 Rubric
  - Prompt 模板版本
- 高级用户可展开查看节点 Prompt，默认只展示摘要，避免界面过载。
- 若要持久化模板版本或用户自定义模板，先更新 `spec.md`，再新增 migration。

测试：

- UI 单测或 E2E 覆盖 Prompt 摘要展示和编辑入口。
- 若新增持久化，补充 DB migration 幂等性测试。

验收：

- 用户能理解每个节点 Prompt 的意图。
- 默认模板版本可追踪。
- 某个模块 Prompt 退化时可以只回滚对应模板。

## 风险与回滚

| 风险 | 表现 | 应对 |
|---|---|---|
| Prompt 变长导致模型输出不稳 | JSON 格式错误、字段缺失 | 使用 schema 收敛，测试关键字段，必要时拆分节点。 |
| 上下文过多导致重点丢失 | 生成内容跑偏 | Context Pack 分优先级，输入前做摘要压缩。 |
| 模型把内部分析输出到正文 | 产物里出现推理过程、解释文本或不可解析内容 | 所有 VLM/LLM 节点统一要求“内部分析、不输出推理链、只输出 JSON”，并用契约测试兜底。 |
| Seedance 过度受参考视频影响 | 画面同质化 | 明确只参考动作/节奏/站位，不复制人物和场景。 |
| 商品/人物变形 | 商品文字错、人物不一致 | 商品图和人物图设最高优先级，质检后生成修复 Prompt。 |
| 行业公式过强导致创意单一 | variant 相似 | 每个 variant 强制不同 hookType、sceneType、visualAnchor。 |

回滚策略：

- 公共 Prompt 常量保留版本号。
- 每次 Prompt 大改补契约单测。
- 若某模块效果退化，可只回滚对应 workflow prompt，不影响 pipeline step 契约。

## 近期推荐开发顺序

1. Prompt 扫描清单和契约测试。
2. 公共 Prompt、Context Pack 与 Seedance Router。
3. `explosion` 爆款裂变。
4. `pretrailer` 广告前贴。
5. `native` 六行业行业公式。
6. `avatar` 数字人口播。
7. 工作流 UI 和模板版本化。

优先做公共层，是因为这套能力会被四条链路共享；先把上下文组织、行业公式、参考策略和质量评分做稳，后续每个模块的效果提升会更可控。
