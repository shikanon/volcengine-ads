---
name: "codex-diagnosis"
description: "说明任务失败后的 Codex CLI 自动诊断机制、输入来源、限制、读取路径与人工排查顺序。排查 pipeline、模型、任务失败问题时调用。"
---

# Codex Diagnosis

## 能力说明

用于基于仓库现有诊断机制定位任务失败原因，尤其适合排查：

- pipeline step 失败
- 模型接口失败
- FFmpeg 失败
- 一致性校验或输入校验失败

它既覆盖自动诊断机制，也覆盖人工接手时应该怎么读日志、产物和错误类型。

## 何时调用

- 用户说“帮我定位为什么任务失败了”。
- 任务状态进入 `paused`。
- 某个 step 抛错后，需要判断是否可重试、该重试哪一步。
- 需要解释 `pipeline.log`、错误类型、诊断文件的作用。
- 需要基于现有产物目录做只读排障。

不适合：

- 用户明确要直接改业务逻辑而不是先排障。
- 只是在写新功能，没有失败上下文。

## 输入信息

- 用户目标：定位失败原因、判断可重试性、解释诊断文件，或基于现有日志与 artifact 做只读排障。
- 问题范围：失败任务 id、任务类型、失败 step、错误信息、是否已有 `codex-diagnosis-<step>.md`。
- 必读上下文：
  - 失败任务对应的 `pipeline.log`
  - 同目录下相关 artifact，例如 `*.json`、`*.md`、`*.mp4`
  - `src/main/pipelines/runner.ts`
  - `src/main/pipelines/codex-diagnosis.ts`
  - `src/main/pipelines/task-log.ts`
  - 失败 step 所在 pipeline 文件
  - `src/main/errors.ts`
- 关键输入事实：
  - `runPipeline()` 中某个 step 抛错后，会记录 `pipeline.log`、触发 `runCodexDiagnosisOnce(...)`、把 step 标为 `failed`、把 task 标为 `paused`
  - 自动诊断 prompt 会带上 task id、task type、失败 step 名、错误类型中文标签、错误信息、可选错误详情、`pipeline.log` 路径、artifact 目录路径
  - 诊断文件命名为 `codex-diagnosis-<stepName>.md`，位于失败任务的 `artifactDir` 下
  - 在 `VITEST` 或 `NODE_ENV=test` 时不会自动触发真实诊断
  - 即使 `codex exec` 自身失败，也可能写出标题为 `# Codex 诊断未完成` 的 Markdown 文件

## 执行步骤

1. 先看错误类型，按 `task-log.ts` 的映射区分 `E_INPUT_VALIDATION`、`E_MODEL_API_FAILED`、`E_FFMPEG_FAILED`、`E_LOW_CONFIDENCE`、`E_AVATAR_INVALID` 等类别。
2. 再看 `pipeline.log`，按 JSON Lines 顺序关注最后一个 `error`、紧邻报错前的 `info` / `warn`，以及 `data` 中的路径、分段索引和请求参数摘要。
3. 对照 artifact 目录判断失败位置：
   - 文案或结构问题优先看 `*.json`、`*.md`
   - 媒体拼接问题优先看 `*.mp4`、`*.m4a`
   - 模型输入问题优先看 `video_prompts.json`、`storyboard.json`、`script.json`
   - 断点续跑问题优先核对 `artifactPath` 是否存在且数据库 step 是否为 `success`
4. 若存在 `codex-diagnosis-<step>.md`，读取内容确认它是成功诊断还是“诊断未完成”，不要只因为文件存在就认为结论可靠。
5. 判断是否可直接重试：第三方模型超时、可降级参考素材失败、后置媒体 step 失败且前置 artifact 完整，通常可优先考虑重试；`E_INPUT_VALIDATION`、`E_AVATAR_INVALID`、明显缺字段或持续低置信度问题，应先修输入再重试。
6. 若随后需要改代码，再把问题归类到模型、媒体、状态机或 pipeline 编排，并转交对应 skill 或修改路径。

## 输出结果

- 一份基于真实日志与 artifact 的诊断结论，明确失败落点、证据和最可能原因。
- 一份可操作的下一步建议，说明是直接重试、从某一步重试，还是必须先修输入或修代码再重试。
- 对 `pipeline.log`、`codex-diagnosis-<step>.md`、关键 artifact 的读取结论摘要，帮助人工快速接手。
- 如需改代码，明确应转向 `pipeline-orchestrator`、`model-client-integration`、`media-composer` 或 `queue-recovery` 哪一类工程 skill。

## 关键约束

- 不能把 Codex 自动诊断当成自动修复。
- 不能在诊断 prompt 里要求它修改源码；当前实现明确是只读。
- 不能忽略 `pipeline.log`，只看最终报错一句话。
- 不能在测试环境里依赖自动诊断产物。
- 不能把“已有诊断文件”误判为“当前这次失败刚刚重新诊断过”。

## 验证与交付

人工诊断时至少确认：

- 是否找到了 `pipeline.log`
- 是否找到了对应 step 的 artifact
- 是否有 `codex-diagnosis-<step>.md`
- 是否已经把问题归因到输入、模型、媒体、状态机中的一类
- 是否能明确回答“直接重试”还是“先修再重试”

如果随后还要改代码，再按仓库要求执行：

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`

## 引用来源

- `src/main/pipelines/runner.ts`
- `src/main/pipelines/codex-diagnosis.ts`
- `src/main/pipelines/task-log.ts`
- `src/main/errors.ts`
- 各业务 pipeline 的 artifact 约定

## 示例

- “`native.asset_generator` 失败时，先看 `pipeline.log` 中最后一次开始调用 Seedance 生成视频片段的日志，再看失败的是哪一段 `segmentIndex`，再判断能否从 `asset_generator` 续跑。”
- “runner 返回的错误信息里如果已经带了日志文件路径和 Codex 诊断文件路径，第一步不是猜，而是先打开这些文件。”
- “如果诊断文件标题是 `# Codex 诊断未完成`，说明自动诊断本身失败了，此时应回退到人工日志和 artifact 排查。”
