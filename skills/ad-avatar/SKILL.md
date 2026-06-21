---
name: "ad-avatar"
description: "负责数字人口播链路。用户要基于数字人图、品牌介绍和产品图生成口播视频，或修改 `avatar` 的校验、脚本确认、云端 TTS、数字人分段生成与成片输出时调用。"
---

# ad-avatar

## 能力说明

负责 `avatar` 任务类型，对应页面入口是“广告数字人口播”。
它从数字人图片、品牌介绍和产品图出发，先校验数字人，再理解商品、解析品牌、生成口播脚本、等待脚本确认，然后做云端 TTS、数字人视频生成、商品图叠加与成片输出。
这是 5 个业务 skill 中唯一一个明确走云端 TTS 分段和数字人视频分段拼接的链路；音频文件会落到本地 artifact，但语音合成本身不在本机推理。

## 何时调用

- 用户要生成数字人口播广告视频时。
- 用户要修改数字人图片校验、品牌解析、商品理解、口播脚本、脚本确认、TTS 切段、数字人生成、商品图叠加或最终成片入库时。
- 用户要排查唇形同步偏差、云端 TTS 音频切段、`avatar_reference.png` 生成、`voice_segments.json` 或 `avatar_segments.json` 行为时。

## 输入

- 任务类型：`avatar`
- 页面表单输入：
  - `avatarImagePath`
  - `brandIntro`：UI 要求 `20..1000` 字
  - `productImagePaths`：UI 要求 `1..3` 张
  - `duration`：`15..60`
  - `resolution`：`480p | 720p | 1080p`
- 必读来源：
  - `AGENTS.md`
  - `spec.md`
  - `src/shared/types.ts`
  - `src/renderer/App.tsx`
  - `src/renderer/pages/Avatar.tsx`
  - `src/main/pipelines/avatar/index.ts`

## 执行步骤

1. 先核对页面真实输入，尤其是品牌介绍长度、产品图数量和视频时长边界。
2. 阅读 `avatar/index.ts`，确认完整顺序是“校验数字人 -> 商品理解 -> 品牌解析 -> 脚本生成 -> 脚本确认 -> TTS -> 视频提示词优化 -> 数字人生成 -> 商品图叠加 -> 后处理”。
3. 对任何改动都要检查：
   - 数字人校验失败是否抛 `E_AVATAR_INVALID`
   - `script_confirm` 是否仍在视频生成前
   - `ctx.modelClient.tts()` 是否仍会按数字人时长上限切成多段
   - `seedance_avatar` 是否会按音频段生成多个视频片段再拼接
   - `overlay` 是否仍负责叠加商品图
4. 需要补文档时，优先写清真实产物与分段行为，不要编造不存在的外部节点。

## 输出结果

- 一份覆盖数字人口播全链路的执行说明。
- 在需要实现或修改代码时，给出只围绕 `avatar` 任务的方案。

## 关键 Step 与产物

1. `validate_avatar`
   - 作用：用视觉模型校验数字人图片是否可用，并基于参考图生成统一的数字人参考图。
   - 产物：`validate.json`、`avatar_reference.png`
2. `product_understand`
   - 作用：理解产品图的形态、颜色、卖点和可见证据。
   - 产物：`product.json`
3. `brand_parse`
   - 作用：解析品牌调性、人群、痛点、差异化卖点与禁用承诺。
   - 产物：`brand.json`
4. `script_gen`
   - 作用：生成口播脚本、卖点时间轴、镜头类型和风控说明。
   - 产物：`script.json`
   - 硬约束：至少 2 个差异化卖点
5. `script_confirm`
   - 作用：等待用户确认口播脚本文案
   - 产物：复用 `script.json`
6. `tts`
   - 作用：通过 `ctx.modelClient.tts()` 调用云端 TTS 接口把口播文本转为音频；若时长超出单段上限则切段生成。
   - 产物：
     - 单段：`voice.mp3`
     - 多段：`voice_segments.json` 和 `voice_part_<index>.mp3`
7. `video_prompt_optimize`
   - 作用：生成数字人视频基础提示词
   - 产物：`video_prompts.json`
8. `seedance_avatar`
   - 作用：按音频段生成数字人视频；多段时拼接为 `avatar.mp4`
   - 产物：
     - 单段：`avatar.mp4`
     - 多段：`avatar_part_<index>.mp4`、`avatar_segments.json`、最终 `avatar.mp4`
   - 额外信息：可能写入最大唇形偏差告警日志
9. `overlay`
   - 作用：把产品图叠加到数字人口播视频上
   - 产物：`final.mp4`
10. `postprocess`
   - 作用：把成片入素材库
   - 产物：复用 `final.mp4`

## 输出

- 数字人校验与参考图：`validate.json`、`avatar_reference.png`
- 商品与品牌理解：`product.json`、`brand.json`
- 口播脚本：`script.json`
- 音频：`voice.mp3` 或 `voice_segments.json` + `voice_part_<index>.mp3`
- 视频提示词：`video_prompts.json`
- 数字人视频：`avatar.mp4`，多段时还有 `avatar_part_<index>.mp4` 与 `avatar_segments.json`
- 最终成片：`final.mp4`

## 边界与约束

- `avatar` 必须经过 `script_confirm`，不能从 `script_gen` 直接跳到视频生成。
- `validate_avatar` 不只做校验，还会产出 `avatar_reference.png` 供后续数字人生成使用。
- TTS 分段和数字人视频分段是当前实现重点，不能简化成“始终单段生成”。
- 这里的 TTS 是云端模型调用，不是本地推理；真实入口是 `src/main/model-client/volcengine.ts` 的 `tts()`，并受 `pLimit(2)` + `pRetry(3)` 约束。
- 若已有 `voice_segments.json`、`voice.mp3` 或旧 `voice.m4a`，当前实现会按兼容逻辑继续读取。
- `seedance_avatar` 调用的是数字人生成接口，不是普通 `generateVideo`。
- `overlay` 是商品露出环节，不要把商品图直接塞进前置 TTS 或脚本确认逻辑。

## 引用来源

- `AGENTS.md` 中“重型 AI 推理全部走云端 API”和 `src/main/model-client/volcengine.ts` 中 `tts()`、`generateDigitalHuman()` 的实现
- `spec.md` 中数字人口播生成、脚本确认、分辨率与视频提示词优化约束
- `src/shared/types.ts` 中 `AvatarInput`、`VideoResolution`
- `src/renderer/App.tsx` 中页面入口“广告数字人口播”
- `src/renderer/pages/Avatar.tsx` 中真实输入校验
- `src/main/pipelines/avatar/index.ts` 中 `validate_avatar` 到 `postprocess` 的真实实现

## 示例

- “用 1 张数字人图、3 张产品图和一段品牌介绍生成 30 秒口播视频”。
- “为什么生成了 `voice_part_1.mp3`、`voice_part_2.mp3`，这是哪里切段的？”。
- “检查 `seedance_avatar` 多段拼接后是否还会输出 `avatar_segments.json`”。
- “修复数字人链路时，不要把普通视频生成接口替换成数字人生成接口”。
