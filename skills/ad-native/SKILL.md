---
name: "ad-native"
description: "负责六行业原生爆款素材生成链路。用户要创建或修改 `native` 的行业路由、脚本确认、合规校验、分段生成、一致性检测与成片输出时调用。"
---

# ad-native

## 能力说明

负责 `native` 任务类型，对应页面入口是“原生爆款素材生成”。
它覆盖六行业原生素材生成全链路：行业路由、概念规划、脚本、脚本确认、分镜、预合规、视频提示词优化、素材生成、一致性检测和成片输出。
这是 5 个业务 skill 中链路最完整的一条，既有脚本确认，也有多变体并发生成、断点续跑和一致性把关。

## 何时调用

- 用户要为游戏、短剧、小说、社交、工具、电商生成原生广告素材时。
- 用户要修改 `native` 的 step 顺序、行业公式、分镜生成、合规改写、分段生成或成片命名规则时。
- 用户要排查参考视频使用、分辨率传递、云端 TTS 混流、失败资产复用、一致性检测或成片入库行为时。

## 输入

- 任务类型：`native`
- 页面表单输入：
  - `industry`：`game | short_drama | novel | social | tool | ecommerce`
  - `brief`
  - `productName?`
  - `referenceVideoPath?`
  - `variantCount`：`1..5`
  - `durationSec`
  - `ratio`：`9:16 | 16:9 | 1:1`
  - `resolution`：`480p | 720p | 1080p`
- 时长边界：
  - `short_drama`：`15..300`
  - `novel`：`15..60`
  - 其他行业：`15..30`
- 必读来源：
  - `AGENTS.md`
  - `spec.md`
  - `src/shared/types.ts`
  - `src/renderer/App.tsx`
  - `src/renderer/pages/Native.tsx`
  - `src/main/pipelines/native/index.ts`

## 执行步骤

1. 先核对行业输入、时长范围、比例和分辨率，确保与页面表单和共享类型一致。
2. 按真实 pipeline 顺序阅读 `native/index.ts`，不要只按规格表格复述。
3. 对需要改动的点，优先判断它属于：
   - 行业路由与行业硬规则
   - 脚本与分镜生成
   - 脚本确认
   - 合规预检与最多两轮改写
   - `video_prompt_optimize`
   - `asset_generator` 的并发、分段、参考视频降级与失败复用
   - `consistency_checker`
   - `composer` 的最终命名与素材入库
4. 修改时必须保持产物路径、失败保留、成功跳过和最终资产登记逻辑。

## 输出结果

- 一份可直接指导 `native` 任务开发或排障的说明文档。
- 一套准确的输入、step、产物、失败处理和边界清单。

## 关键 Step 与产物

1. `industry_router`
   - 作用：把行业定义和硬规则写入路由结果。
   - 产物：`industry.json`
2. `concept_planner`
   - 作用：按行业公式规划多个概念方向。
   - 产物：`concepts.json`
3. `script_writer`
   - 作用：生成多版脚本，并写出便于确认的 Markdown。
   - 产物：`scripts.json`、`scripts.md`
4. `script_confirm`
   - 作用：挂起到 `waiting_confirmation`，等待用户确认脚本。
   - 产物：复用 `scripts.md`
5. `storyboard_builder`
   - 作用：按脚本生成多版分镜，镜头同时包含 `imagePrompt` 与 `videoPrompt`。
   - 产物：`storyboard.json`
6. `compliance_pre`
   - 作用：基于行业黑词/禁用场景做预合规；不通过时最多 2 轮模型改写。
   - 产物：`compliance_pre.json`
7. `video_prompt_optimize`
   - 作用：把脚本和分镜整理为最终视频提示词；长视频会先切分为多个段。
   - 产物：`video_prompts.json`
8. `asset_generator`
   - 作用：并发生成各变体视频；可使用参考视频；参考被拒绝时回退为无参考；失败会保留成功片段，重试跳过成功项。
   - 产物：
     - `assets.json`
     - `asset_variant_<index>.mp4`
     - 分段时 `asset_variant_<index>_part_<segment>.mp4`
     - 如需云端口播混流，还会先生成 `asset_variant_<index>_silent.mp4`
9. `consistency_checker`
   - 作用：对生成结果做视频理解校验，一致性不足会抛 `E_LOW_CONFIDENCE`
   - 产物：`consistency.json`
10. `composer`
   - 作用：复制并命名最终成片，登记到素材库。
   - 产物：`finals.json`、`final_<index>.mp4`
   - 特殊规则：小说行业命名为 `AIGC_novel_<title>_<index>.mp4`

## 输出

- 行业路由：`industry.json`
- 概念与脚本：`concepts.json`、`scripts.json`、`scripts.md`
- 分镜与合规：`storyboard.json`、`compliance_pre.json`
- 视频提示词：`video_prompts.json`
- 生成结果：`assets.json`
- 一致性报告：`consistency.json`
- 最终成片：`finals.json` 和若干 `final_*.mp4` 或小说命名成片

## 边界与约束

- 不能删除 `script_confirm`，`native` 必须在视频生成前让用户确认脚本。
- 不能跳过 `video_prompt_optimize` 后直接让 `asset_generator` 用原始脚本发起生成。
- `asset_generator` 是当前最复杂节点：
  - 并发上限由 `pLimit(4)` 控制
  - 会复用成功资产和成功片段
  - 允许部分失败并保留成功结果
  - 重试时应跳过成功项
- 若有 `voiceover`，当前实现会调用 `ctx.modelClient.tts()` 走云端 TTS，再用 `muxAudioVideo()` 把口播音频混到静音拼接后的视频；无口播时才直接保留 Seedance 自带音频。
- `asset_variant_<index>_silent.mp4` 表示“后续要混入云端 TTS 口播”的中间文件，不代表仓库存在本地语音合成引擎。
- `consistency_checker` 是质量门，不是可随意删掉的附属步骤。
- `composer` 前还会再次做合规校验，不能把不合规成片直接入库。

## 引用来源

- `AGENTS.md` 中“重型 AI 推理全部走云端 API”的约束
- `spec.md` 中 `native` 输入契约、六行业矩阵、脚本确认和视频提示词优化约束
- `src/shared/types.ts` 中 `NativeInput`、`NativeIndustry`、`NativeRatio`、`VideoResolution`
- `src/renderer/App.tsx` 中页面入口“原生爆款素材生成”
- `src/renderer/pages/Native.tsx` 中真实表单和行业时长边界
- `src/main/model-client/volcengine.ts` 中 `tts()` 的云端实现
- `src/main/pipelines/native/index.ts` 中 10 个 step、分段生成、TTS 混流、失败复用和最终命名实现

## 示例

- “给工具类产品生成 3 条 9:16 原生爆款视频，并保留脚本确认节点”。
- “检查为什么一个 25 秒任务会被切成多个 Seedance 片段”。
- “修复 `assets.json` 的复用逻辑，但不要破坏失败后保留成功项的行为”。
- “小说行业最终命名为什么不是 `final_1.mp4`，请按真实实现说明”。
