---
name: "media-composer"
description: "说明本仓库 FFmpeg 媒体处理、拼接、淡入淡出、音轨补齐、口播合成与产物路径规则。修改 `src/main/media/**` 或相关 pipeline 媒体节点时调用。"
---

# Media Composer

## 能力说明

用于在本仓库中处理本地媒体编排，包括：

- 视频标准化
- 截取音频和视频
- 音视频合成
- 多段视频拼接
- 前贴淡入淡出拼接
- 数字人口播成片叠图
- 缺失音轨时的静音补齐

## 何时调用

- 用户要修改 `src/main/media/ffmpeg.ts`。
- 用户要实现视频拼接、音频替换、转码、抽帧、叠图。
- 用户要排查 FFmpeg 失败、拼接后无音频、尺寸不一致、淡入淡出异常。
- 用户要给 pipeline 增加本地媒体处理节点。
- 用户要确认最终 artifact 路径和成片落盘规则。

不适合：

- 仅调整云端视频生成 prompt。
- 仅调整队列恢复或任务状态机。

## 输入信息

- 用户目标：新增或修改媒体处理函数、排查媒体合成失败、确认某条 pipeline 的媒体产物规则。
- 问题范围：目标 pipeline、输入媒体类型、输出文件名、是否要求保留音轨、是否涉及多段拼接、淡入淡出或叠图。
- 必读上下文：
  - `AGENTS.md` §8、§13
  - `spec.md` §6
  - `src/main/media/ffmpeg.ts`
  - 目标 pipeline 中的媒体调用点：
    - `src/main/pipelines/explosion/index.ts`
    - `src/main/pipelines/pretrailer/index.ts`
    - `src/main/pipelines/avatar/index.ts`
    - `src/main/pipelines/native/index.ts`
  - `tests/unit/ffmpeg-audio-concat.test.ts`
  - `tests/unit/ffmpeg-path.test.ts`
  - `package.json` 中与打包相关的 FFmpeg 配置
- 关键输入事实：
  - 仓库通过 `ffmpeg-static` 提供二进制，并在打包后通过 `app.asar.unpacked` 路径访问
  - `ffmpeg.ts` 内部的命令失败统一转成 `AppError('E_FFMPEG_FAILED', ...)`
  - 当前已实现能力包括 `normalizeVideo()`、`trimVideo()`、`extractAudio()`、`transcodeAudioToMp3()`、`trimAudio()`、`concatAudioSegments()`、`extractFrames()`、`replaceAudio()`、`muxAudioVideo()`、`concatWithFade()`、`concatVideos()`、`concatSilentVideos()`、`overlayProductImages()`
  - 常见产物位于 `artifactDir`，如 `source.mp4`、`source.m4a`、`pretrailer.mp4`、`voice.mp3`、`avatar.mp4`、`final.mp4`、`asset_variant_1.mp4`
  - `AGENTS.md` / `spec.md` 把 FFmpeg 归为应运行在 Utility Process 的重活边界，但当前仓库没有 `utilityProcess` / `ffmpeg-worker` 实装，`src/main/media/ffmpeg.ts` 仍在主进程直接调用 `fluent-ffmpeg`

## 执行步骤

1. 先确认是否已有现成媒体函数可复用，避免在 pipeline 内重复手写 `fluent-ffmpeg` 命令。
2. 再读目标 pipeline 的调用点，确认当前真实用途：
   - `explosion` 主要使用 `normalizeVideo()`、`extractAudio()`、`trimVideo()`、`concatSilentVideos()`
   - `pretrailer` 主要使用 `normalizeVideo()`、`extractAudio()`、`concatWithFade()`
   - `avatar` 主要使用 `transcodeAudioToMp3()`、`concatVideos()`、`overlayProductImages()`
   - `native` 主要使用 `trimVideo()`、`concatSilentVideos()`、`concatVideos()`、`muxAudioVideo()`
3. 对边界描述要同时区分“规格要求”和“当前实现”：
   - 规格要求：FFmpeg 应收敛到 Utility Process，避免阻塞主进程
   - 当前实现：`ffmpeg.ts` 仍在 Main 中执行，没有现成 worker 可直接复用
   - 因此不能把 skill 写成“已经完成 Utility Process 隔离”
4. 若修改函数，保持输出路径由调用方显式传入，并在函数内部负责创建输出目录。
5. 若涉及拼接，先判断是保留模型音轨还是静音拼接后再叠加音频；缺失音轨时继续沿用 `anullsrc` 回退，不要假设每段视频都有声音。
6. 若涉及不同尺寸或比例的媒体，优先复用已有尺寸读取和滤镜逻辑，不要直接拼接原始流。
7. 若涉及打包或 FFmpeg 路径，保留 `resolveFfmpegBinaryPath()` 和 `asarUnpack` 相关约束，不要写死本机绝对路径。
8. 给 pipeline 增加媒体节点时，先固定 artifact 名称，再选择合适函数；需要成片入库时在 step 里调用 `repository.createAsset()`，需要排障时用 `ctx.appendLog()` 记录输入段列表、输出路径和失败原因。
9. 涉及音频行为时，要按真实 pipeline 区分：
   - `native` 有口播时走云端 `ModelClient.tts()`，随后用 `muxAudioVideo()` 混流
   - `explosion` 多段时用 `concatSilentVideos()`，最终文件不保证保留分段音轨
   - `avatar` 兼容历史 `voice.m4a`，会先 `transcodeAudioToMp3()`

## 输出结果

- 一份基于真实代码的媒体处理说明，明确函数能力、调用边界、产物路径和不同 pipeline 的媒体链路用途。
- 一套收敛到 `src/main/media/ffmpeg.ts` 的实现或修改方案，不把冗长 FFmpeg 细节散落到各个 pipeline step。
- 明确的媒体排障结论，例如“为什么拼接后无音轨”“为什么前贴淡入淡出失败”“为什么某段视频尺寸不兼容”。
- 对应的 artifact 命名与落盘规则，确保仍可被断点续跑和日志排查稳定复用。

## 关键约束

- 不能在 renderer 里直接做 FFmpeg 处理。
- 不能忽略输出目录创建。
- 不能假设每段视频都有音轨。
- 不能在拼接不同尺寸视频时直接 concat 原始流。
- 不能让 pipeline 自己手写冗长 FFmpeg 细节，优先收敛到 `src/main/media/ffmpeg.ts`。
- 不能把媒体处理错误误报成 `E_MODEL_API_FAILED`。
- 当前真实实现仍以 `src/main/media/ffmpeg.ts` 为准；若 `spec.md` 或 `AGENTS.md` 对 Utility Process 有更强约束，修改 skill 或代码前要先核对并明确差异，不能继续固化错误边界描述。
- 不能把云端 TTS 产物误写成“本地 TTS 引擎”；音频只是在本地落盘，语音合成本身走 `ModelClient.tts()`。

## 验证与交付

优先跑：

- `tests/unit/ffmpeg-audio-concat.test.ts`
- `tests/unit/ffmpeg-path.test.ts`

如果改动影响具体 pipeline，再跑对应 pipeline 单测。

最终收尾：

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`

## 引用来源

- `AGENTS.md`
- `spec.md`
- `src/main/media/ffmpeg.ts`
- `src/main/pipelines/explosion/index.ts`
- `src/main/pipelines/pretrailer/index.ts`
- `src/main/pipelines/avatar/index.ts`
- `src/main/pipelines/native/index.ts`
- `tests/unit/ffmpeg-audio-concat.test.ts`
- `tests/unit/ffmpeg-path.test.ts`
- `package.json`

## 示例

- “前贴与原片拼接时，先生成 `pretrailer.mp4`，再在 `concat` step 调 `concatWithFade(pretrailer.mp4, source.mp4, final.mp4, { firstDurationSec })`，最后把 `final.mp4` 入素材库。”
- “多段 Seedance 结果拼接时，需要保留模型音频就用 `concatVideos()`，只保留画面、后续再叠加云端 TTS 时用 `concatSilentVideos()`。”
- “若历史音频是 `voice.m4a`，数字人口播链路会先转成 `voice.mp3` 再进入生成；修改时不要破坏这条兼容路径。”
