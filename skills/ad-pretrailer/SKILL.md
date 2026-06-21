---
name: "ad-pretrailer"
description: "负责广告前贴生成链路。用户要基于原广告视频生成前贴钩子，或修改 `pretrailer` 的理解、文案、分镜、确认、Seedance 直出与拼接逻辑时调用。"
---

# ad-pretrailer

## 能力说明

负责 `pretrailer` 任务类型，对应页面入口是“广告吸引前贴生成”。
它从原广告视频出发，先理解原片，再按前贴类型生成首秒钩子文案和前贴分镜，经 `script_confirm` 确认后，生成带声音的前贴视频并与原片拼接。
当前实现不走本地 TTS，也不单独做前贴音视频合成，`seedance` 直接输出带音轨的 `pretrailer.mp4`。

## 何时调用

- 用户要根据原广告视频生成 5 到 10 秒的开场前贴时。
- 用户要修改前贴类型约束、原片理解、首秒钩子、分镜脚本、脚本确认、视频提示词优化或拼接效果时。
- 用户要排查为什么首秒钩子失败、为什么任务停在确认节点、为什么最终成片是 `final.mp4` 时。

## 输入

- 任务类型：`pretrailer`
- 页面表单输入：
  - `sourceVideoPath`
  - `pretrailerDuration`：`5..10`
  - `style`：来自 `PRETRAILER_VIDEO_TYPE_DEFINITIONS`
  - `resolution`：`480p | 720p | 1080p`
- 当前可选前贴类型包括：
  - `benefit`
  - `asmr`
  - `curiosity`
  - `surreal`
  - `giant_miniature`
  - `street_conflict`
  - `bizarre_scene`
  - `emotional_resonance`
  - `emotional_amplification`
- 必读来源：
  - `AGENTS.md`
  - `spec.md`
  - `src/shared/types.ts`
  - `src/renderer/App.tsx`
  - `src/renderer/pages/Pretrailer.tsx`
  - `src/main/pipelines/pretrailer/index.ts`

## 执行步骤

1. 先核对页面真实输入，尤其是 `style` 和 `pretrailerDuration`。
2. 再读 `pretrailer/index.ts`，确认前贴链路是“理解原片 -> 生成文案 -> 生成分镜 -> 确认 -> 提示词优化 -> 生成 -> 拼接”。
3. 对修改点重点检查：
   - `copy_gen` 与 `script_gen` 是否同时受 `style` 模板约束
   - 首秒钩子是否不晚于 1 秒
   - `script_confirm` 是否仍存在
   - `seedance` 是否仍是直出带声音视频
   - `concat` 是否仍把 `pretrailer.mp4` 拼到 `source.mp4` 前面
4. 涉及输出说明时，以真实 artifact 名称为准，不要臆造 `voice.mp3` 等不存在产物。

## 输出结果

- 一份准确描述广告前贴工作流的说明文档。
- 在需要改代码时，给出遵循当前前贴链路的修改方案。

## 关键 Step 与产物

1. `ingest`
   - 作用：规范化原视频并提取原音频。
   - 产物：`source.mp4`、`source.m4a`
2. `understand`
   - 作用：用完整视频理解原广告的卖点、视觉风格、受众和衔接需求。
   - 产物：`understanding.json`
3. `copy_gen`
   - 作用：按所选前贴类型生成首秒钩子文案。
   - 产物：`copy.json`
   - 硬约束：`hookAtSec` 必须小于等于 1
4. `script_gen`
   - 作用：把前贴文案展开为镜头脚本，保留首秒钩子与末帧衔接原片的要求。
   - 产物：`script.json`
   - 硬约束：首镜头时长必须小于等于 1 秒
5. `script_confirm`
   - 作用：等待用户确认前贴脚本
   - 产物：复用 `script.json`
6. `video_prompt_optimize`
   - 作用：把前贴脚本整理为最终 Seedance 提示词
   - 产物：`video_prompts.json`
7. `seedance`
   - 作用：直出带声音的前贴视频
   - 产物：`pretrailer.mp4`
8. `concat`
   - 作用：把前贴与原片淡入淡出拼接
   - 产物：`final.mp4`
   - 附加行为：把 `final.mp4` 以 `video` 类型登记到素材库

## 输出

- 原片理解：`understanding.json`
- 前贴文案：`copy.json`
- 前贴脚本：`script.json`
- 视频提示词：`video_prompts.json`
- 前贴视频：`pretrailer.mp4`
- 最终成片：`final.mp4`

## 边界与约束

- 前贴不是独立视频项目，而是“前贴 + 原片”的拼接链路。
- `copy_gen` 和 `script_gen` 必须同时受用户选择的 `style` 约束，不能一个按类型生成、另一个忽略类型。
- 必须保留 `script_confirm`，前贴也属于视频生成前先确认脚本的任务。
- 当前实现没有本地 TTS、没有前贴音视频二次合成 step，不要把旧链路写回来。
- `seedance` 当前不传参考视频，只基于前贴脚本和原片理解构建提示词。
- `concat` 使用 `concatWithFade`，并记录 `xfade transition=fade:duration=0.4` 日志。

## 引用来源

- `spec.md` 中前贴类型、脚本确认、`video_prompt_optimize`、Seedance 直出和 `concat` 约束
- `src/shared/types.ts` 中 `PretrailerInput`、`PretrailerStyle` 与前贴类型定义
- `src/renderer/App.tsx` 中页面入口“广告吸引前贴生成”
- `src/renderer/pages/Pretrailer.tsx` 中真实表单字段和默认值
- `src/main/pipelines/pretrailer/index.ts` 中 `ingest` 到 `concat` 的真实实现

## 示例

- “给这条原广告生成一个 7 秒的巨物/微型前贴，并保留末帧自然接原片”。
- “为什么 `copy_gen` 生成的钩子被判定不合法？检查是否晚于 1 秒出现”。
- “确认前贴脚本后，后续必须先写 `video_prompts.json` 再走 `seedance`”。
- “不要给前贴额外加 TTS 节点，当前实现就是 Seedance 直出带声音视频”。
