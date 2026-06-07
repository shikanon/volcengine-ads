---
name: "ad-explosion"
description: "负责广告爆款裂变链路。用户要从抖音或本地爆款素材生成多版裂变视频，或修改 `explosion` 的解析、改写、确认与 Seedance 生成逻辑时调用。"
---

# ad-explosion

## 能力说明

负责 `explosion` 任务类型，对应页面入口是“广告爆款素材裂变”。
它把抖音链接或本地爆款视频整理为标准源视频，经过 ASR、原片脚本解析、裂变改写、脚本确认、提示词优化后，生成多条裂变视频。
当前实现不做本地 TTS、音频替换或后置口播合成；单段生成时结果直接来自 Seedance，多段生成时会用 `concatSilentVideos()` 只拼画面，因此最终成片不应被描述为“始终直出带声音”。

## 何时调用

- 用户要从抖音链接或本地视频生成多个裂变广告素材时。
- 用户要修改 `download`、`asr`、`script_parse`、`rewrite`、`script_confirm`、`video_prompt_optimize`、`seedance` 任一步时。
- 用户要排查裂变脚本确认、参考视频拒绝降级、分段生成、分辨率传递或最终视频入库行为时。

## 输入

- 任务类型：`explosion`
- 页面表单输入：
  - 来源二选一：`douyinUrl?` 或 `sourceVideoPath?`
  - `variantCount`：UI 允许 `1..10`
  - `resolution`：`480p | 720p | 1080p`
- 必读来源：
  - `AGENTS.md`
  - `spec.md`
  - `src/shared/types.ts`
  - `src/renderer/App.tsx`
  - `src/renderer/pages/Explosion.tsx`
  - `src/main/pipelines/explosion/index.ts`

## 执行步骤

1. 确认输入来自抖音链接或本地视频，两者至少有一个。
2. 对照 `Explosion.tsx` 与 `ExplosionInput`，确认 `variantCount` 和 `resolution` 的真实输入边界。
3. 按 `src/main/pipelines/explosion/index.ts` 的实际顺序梳理 step，尤其是：
   - 原片标准化与抽音频
   - ASR 转录
   - 视频理解解析分镜与 CTA
   - 裂变改写与 `variants.md`
   - `script_confirm` 等待用户确认
   - `video_prompt_optimize` 产出可直接用于 Seedance 的提示词
   - `seedance` 分段生成并在需要时拼接
4. 如果修改实现，要保留“脚本确认后再继续”的行为，以及参考视频被拒绝后的无参考兜底逻辑。

## 输出结果

- 一份基于真实裂变链路的说明，覆盖输入、step、关键产物、确认环节和最终视频输出。
- 在涉及代码修改时，只提出符合现有 `explosion` pipeline 的变更方案。

## 关键 Step 与产物

1. `download`
   - 作用：下载抖音视频或规范化本地视频，并提取音频。
   - 产物：`source.mp4`、`source.m4a`、`meta.json`
2. `asr`
   - 作用：对 `source.m4a` 做语音识别。
   - 产物：`transcript.json`
3. `script_parse`
   - 作用：对完整视频做视觉理解，抽取 CTA、场景、钩子公式、可保留/可替换片段。
   - 产物：`script_parse.json`
4. `rewrite`
   - 作用：生成多版裂变脚本、差异化策略与分镜。
   - 产物：`variants.json`、`variants.md`
5. `script_confirm`
   - 作用：展示 `variants.md`，把任务挂到 `waiting_confirmation`，等待 `task:confirm-script`
   - 产物：确认节点本身不再新生成业务内容，复用上游脚本文案
6. `video_prompt_optimize`
   - 作用：按变体和分段整理最终 Seedance 提示词，并同时准备无参考视频兜底提示词。
   - 产物：`video_prompts.json`
7. `seedance`
   - 作用：按变体生成视频；超过单次时长上限时自动分段，必要时拼接。
   - 产物：
     - `variant_<index>.mp4`
     - 分段时还有 `variant_<index>_part_<segment>.mp4`
     - 汇总结果 `seedance_outputs.json`
   - 附加行为：把最终 `variant_<index>.mp4` 以 `video` 类型登记到素材库
   - 音频说明：请求参数仍传 `generateAudio: true`；但若一个变体被拆成多段，当前实现使用 `concatSilentVideos()` 拼接 `variant_<index>_part_<segment>.mp4`，最终 `variant_<index>.mp4` 不保留分段音轨。

## 输出

- 裂变脚本文档：`variants.md`
- 裂变脚本 JSON：`variants.json`
- 视频提示词：`video_prompts.json`
- 最终视频：`variant_<index>.mp4`
- 结果汇总：`seedance_outputs.json`

## 边界与约束

- `explosion` 必须经过 `script_confirm`，不能直接从改写跳到视频生成。
- `video_prompt_optimize` 是必须节点，不能让 `seedance` 直接绕过它长期存在。
- 参考视频被模型拒绝时，当前实现会自动改用无参考提示词重试；这是保底逻辑，不是单独新 step。
- 裂变链路当前固定输出 `9:16` 视频。
- 不要给 `seedance` 额外接入本地 TTS 或音频替换；规格和实现都已去掉这条链路。
- `generateAudio: true` 是当前请求参数，但只能说明单段 Seedance 片段会尝试带音频；多段场景下当前拼接函数是 `concatSilentVideos()`，最终文件可能无音轨。

## 引用来源

- `spec.md` 中裂变任务的脚本确认、`video_prompt_optimize` 与 Seedance 直出约束
- `src/shared/types.ts` 中 `ExplosionInput`、`TaskType`、`VideoResolution`
- `src/renderer/App.tsx` 中页面入口“广告爆款素材裂变”
- `src/renderer/pages/Explosion.tsx` 中真实表单字段
- `src/main/pipelines/explosion/index.ts` 中下载、理解、改写、确认和生成实现
- `src/main/media/ffmpeg.ts` 中 `concatSilentVideos()` 的真实拼接行为

## 示例

- “把这个抖音链接裂变成 5 条新视频，保留 CTA 和高转化结构”。
- “为什么任务停在 `waiting_confirmation`，确认后应该从哪个 step 往下走？”
- “检查参考视频被 Seedance 拒绝时的无参考重试逻辑是否还在”。
- “补充 `video_prompts.json` 的说明，但不要把爆款裂变改成带本地配音的链路”。
