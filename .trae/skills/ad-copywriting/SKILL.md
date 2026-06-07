---
name: "ad-copywriting"
description: "负责广告文案脚本编写链路。用户要从需求生成脚本，或修改 `copywriting` 的行业路由、联网补充、策略分析与脚本产物时调用。"
---

# ad-copywriting

## 能力说明

负责 `copywriting` 任务类型，对应页面入口是“广告文案脚本编写”。
它面向“输入需求 -> 匹配行业模板 -> 模板优化 -> 联网补充 -> 需求拆解 -> 策略分析 -> 输出多版脚本”的纯文案工作流。
它不生成视频、音频或图片，也不进入 `script_confirm` 和 `video_prompt_optimize`。
最终核心产物是 `scripts.json` 与可直接复用、可入素材库的 `scripts.md`。

## 何时调用

- 用户要根据产品需求直接生成广告脚本、信息流文案或直播口播时。
- 用户要修改 `copywriting` 相关 step，如 `industry_router`、`template_optimize`、`web_research`、`requirement_decompose`、`strategy_analysis`、`script_writer` 时。
- 用户要核对广告文案脚本的输入字段、行业匹配逻辑、联网补充行为、脚本 Markdown 格式或素材库登记行为时。
- 用户要排查为什么 `copywriting` 没有进入脚本确认、没有生成视频、或没有产出 `scripts.md` 时。

## 输入

- 任务类型：`copywriting`。
- 页面表单输入：
  - `industry`：`auto | game | short_drama | novel | social | tool | ecommerce`
  - `requirement`：需求描述，UI 要求至少 10 个字，最大 4000 字
  - `productName?`
  - `audience?`
  - `platform?`
  - `format`：`short_video | feed_ad | live_stream`
  - `variantCount`：`1..5`
  - `durationSec`：`15..120`
  - `enableWebSearch?`：默认开启
- 必读来源：
  - `AGENTS.md`
  - `spec.md`
  - `src/shared/types.ts`
  - `src/renderer/App.tsx`
  - `src/renderer/pages/Copywriting.tsx`
  - `src/main/pipelines/copywriting/index.ts`

## 执行步骤

1. 先核对 `AGENTS.md` 与 `spec.md`，确认 `copywriting` 是独立一级任务，且不进入视频生成链路。
2. 再核对 `src/shared/types.ts` 与 `src/renderer/pages/Copywriting.tsx`，确认表单真实收集的字段、默认值和取值范围。
3. 读取 `src/main/pipelines/copywriting/index.ts`，以真实 step 顺序和 artifact 文件名为准组织说明。
4. 如果要修改实现，优先保证：
   - 行业路由仍从六行业模板出发
   - 联网补充只能经 `ModelClient.webSearch`
   - 最终必须写出 `scripts.json` 和 `scripts.md`
   - `scripts.md` 要继续以 `script` 类型登记到素材库
5. 若规格、页面和实现不一致，以 `spec.md` 为准，并先暂停确认，不要自行编造新 step。

## 输出结果

- 一份基于真实代码的 `copywriting` 能力说明。
- 明确的输入、step、artifact、边界和示例。
- 在需要修改代码时，给出只覆盖 `copywriting` 文案链路的变更方案。

## 关键 Step 与产物

1. `industry_router`
   - 作用：手动行业直接路由；`auto` 时按关键词匹配六行业模板。
   - 产物：`industry.json`
2. `template_optimize`
   - 作用：把行业模板优化为当前需求专用的脚本公式、角度库、写作规则、合规规则。
   - 产物：`template.json`
3. `web_research`
   - 作用：通过 `ctx.modelClient.webSearch()` 补充产品、热点和热梗；关闭联网时写入禁用说明而不是跳过 artifact。
   - 产物：`research.json`
4. `requirement_decompose`
   - 作用：拆出产品、人群、卖点、平台语境、限制条件和创意角度。
   - 产物：`requirement.json`
5. `strategy_analysis`
   - 作用：分析钩子、转化路径、证据背书、语气和风险规避。
   - 产物：`analysis.json`
6. `script_writer`
   - 作用：输出多条脚本，并把可读 Markdown 落盘到素材库。
   - 产物：`scripts.json`、`scripts.md`
   - 附加行为：`repository.createAsset({ kind: 'script' })`

## 输出

- 结构化脚本包：`scripts.json`
- 用户可读脚本文档：`scripts.md`
- 素材库记录：`kind: 'script'`，tags 包含 `copywriting`、行业、脚本形式
- 不输出视频、音频、图片、`final.mp4` 或 `video_prompts.json`

## 边界与约束

- 只能使用仓库中已存在的 6 个 step，不能擅自加入 `script_confirm`、`tts`、`seedance` 或 `composer`。
- `copywriting` 是纯文案链路，不能写成视频生成 skill。
- 联网补充只能通过模型客户端适配层，不能在 pipeline 内直接 `fetch` 外网。
- `industry=auto` 时默认兜底为 `ecommerce`，这是当前实现，不要改写成其他行业。
- `scripts.md` 必须继续保留“需求拆解摘要 / 联网补充 / 策略判断 / 脚本方案”等可读结构。
- 若模型返回 JSON 缺字段，当前实现会抛 `AppError`，不要用静默降级掩盖问题。
## 引用来源

- `spec.md` 中 `copywriting` 任务类型与 step 约束
- `spec.md` 中 `copywriting` 的输入契约与“不进入视频生成”的约束
- `src/shared/types.ts` 中 `TaskType`、`CopywritingInput`、`CopywritingIndustry`、`CopywritingScriptFormat`
- `src/renderer/App.tsx` 中页面入口“广告文案脚本编写”
- `src/renderer/pages/Copywriting.tsx` 中真实表单字段与默认值
- `src/main/pipelines/copywriting/index.ts` 中 6 个 step、artifact 与素材库写入实现
## 示例

- “用户要从需求生成脚本、调整 copywriting pipeline 或补充脚本文案产物规范时调用”
- “给一个保温杯产品需求，生成 3 条抖音短视频广告脚本”。
- “检查 `copywriting` 为什么没写出 `scripts.md`”。
- “把 `web_research` 关闭时的产物格式写清楚，别让后续 step 读不到 `research.json`”。
- “调整 `script_writer` 的 Markdown 输出结构，但不要把这个任务改成视频工作流”。
