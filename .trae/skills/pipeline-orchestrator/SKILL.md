---
name: "pipeline-orchestrator"
description: "说明本仓库 pipeline 编排、step 状态、artifact、进度、脚本确认与失败暂停。任务涉及新增/修改 `src/main/pipelines/**` 或排查执行链路时调用。"
---

# Pipeline Orchestrator

## 能力说明

用于在本仓库里设计、修改、排查或解释主进程 pipeline 编排逻辑。重点覆盖：

- task type 到 pipeline 的映射
- step 的顺序和命名约束
- artifact 落盘规则
- 进度事件、脚本文案确认、失败暂停
- 断点续跑与重试时如何复用成功 step

## 何时调用

- 用户要新增或修改 `src/main/pipelines/**` 中任一任务流程。
- 用户要新增 step、调整 step 顺序、修改 artifact 名称或确认节点行为。
- 用户要实现断点续跑、step 重试、任务恢复、进度推送。
- 用户反馈 pipeline 在某个 step 卡住、重复执行、跳过不该跳过的节点。
- 用户要确认实现是否仍与 `spec.md` 和现有测试约束一致。

不适合：

- 仅修改 UI 展示，不涉及主进程流程编排。
- 仅修改云端模型 HTTP 调用细节，这更适合 `model-client-integration`。
- 仅修改 FFmpeg 拼接逻辑，这更适合 `media-composer`。

## 输入信息

- 用户目标：新增、修改、解释或排查某条 pipeline、某个 step、某种恢复语义。
- 任务范围：涉及的 `TaskType`、目标 step 名称、异常现象、预期 artifact、是否包含脚本确认或重试。
- 必读上下文：
  - `AGENTS.md` 中 §7 外部 API 调用、§8 Pipeline 实现规则、§9 测试要求
  - `spec.md` 中对应任务类型和 step 定义
  - `src/main/pipelines/index.ts`
  - `src/main/pipelines/runner.ts`
  - `src/main/pipelines/types.ts`
  - `src/main/pipelines/helpers.ts`
  - 目标 pipeline 文件，如 `src/main/pipelines/native/index.ts`
  - `src/main/db/index.ts`
  - `src/main/queue/worker.ts`
  - `tests/unit/pipeline-contract.test.ts`
  - `tests/unit/pipeline-logging.test.ts`
- 关键输入事实：
  - 当前注册任务类型：`explosion`、`pretrailer`、`avatar`、`native`、`copywriting`
  - step 统一接口：`runStep(ctx: StepContext): Promise<StepResult>`
  - `StepResult` 仅允许返回 `artifactPath`、`logs`、`awaitingConfirmation`
  - 常见 artifact 位于 `userData/artifacts/<taskId>/`，如 `source.mp4`、`transcript.json`、`variants.json`、`video_prompts.json`、`assets.json`、`finals.json`、`pipeline.log`

## 执行步骤

1. 先核对 `AGENTS.md` 与 `spec.md`，确认目标任务类型允许的 step 名称、顺序、产物和失败语义。
2. 再读 `src/main/pipelines/index.ts`，确认任务到 pipeline 的真实注册关系，以及 `getStepNames()` 是否会被建任务和测试复用。
3. 读 `src/main/pipelines/runner.ts`，确认统一执行语义：step 开始写 `running`，成功写 `success`，等待确认写 `waiting_confirmation`，失败写 `failed` 并把任务整体置为 `paused`。
4. 若改 step 实现，在目标 pipeline 文件中保持独立 `async function runXxx(ctx)`，模型调用只通过 `ctx.modelClient`，artifact 通过固定文件名落盘。
5. 若改断点续跑，确认 runner 的跳过条件仍然是“数据库 step 已 `success` 且 `artifactPath` 存在且磁盘文件真实存在”。
6. 若改脚本确认，保留视频类流程的 `script_confirm` 行为：step 和 task 同时进入 `waiting_confirmation`，用户通过 `task:confirm-script` 恢复到 `queued`。
7. 若改失败处理，保留统一日志、`AppError`、`runCodexDiagnosisOnce()`、任务暂停和进度事件，不要在 step 内吞错或静默结束。
8. 若实现从某一步重试，沿用 `task:retry-step` -> `TaskWorker.retryStep()` -> `repository.resetStepAndFollowing()` -> 仅重置目标 step 及后续 step 的现有路径。
9. 修改后至少回归 step 顺序、关键 artifact、失败语义和日志行为相关单测。

## 输出结果

- 一份基于真实仓库实现的 pipeline 编排说明，明确 task type、step 顺序、artifact、脚本确认、失败暂停和断点续跑规则。
- 一套只覆盖目标 pipeline 或 runner 的修改方案，不绕过现有 `TaskRepository`、`ModelClient`、进度事件和 artifact 规则。
- 明确的排障结论，例如“为什么任务恢复后又从头开始”“为什么某个 step 会被跳过”“为什么确认脚本后没有继续执行”。
- 如涉及产物说明，应明确对应文件名和路径仍位于 `userData/artifacts/<taskId>/`。

## 关键约束

- 不能修改 step 名称来绕过现有规格和测试。
- 不能在 renderer 层直接编排 pipeline。
- 不能直接跨层 import `src/main/**` 到 renderer。
- 不能在 pipeline step 内直接 `fetch` 外网。
- 不能让 step 成功但不落盘 artifact，否则断点续跑会失效。
- 不能把失败任务留在 `running`，仓库现状要求暂停为 `paused`。
- 不能为视频类任务移除 `script_confirm` 或 `video_prompt_optimize`，除非规格已改。

## 验证与交付

优先做这些检查：

- `npm test -- pipeline-contract` 或直接 `npm test`
- 若动了 runner / 日志 / 失败行为，覆盖 `tests/unit/pipeline-logging.test.ts`
- 若改了某条业务 pipeline，运行对应 pipeline 单测：
  - `tests/unit/explosion-pipeline.test.ts`
  - `tests/unit/pretrailer-pipeline.test.ts`
  - `tests/unit/avatar-pipeline.test.ts`
  - `tests/unit/native-pipeline.test.ts`
  - `tests/unit/copywriting-pipeline.test.ts`
- 最终遵循仓库约束执行：
  - `npm run typecheck`
  - `npm run lint`
  - `npm test`
  - `npm run build`

如果本次只写 skill 文档，可说明未执行构建。

## 引用来源

- `AGENTS.md`
- `spec.md`
- `src/main/pipelines/index.ts`
- `src/main/pipelines/runner.ts`
- `src/main/pipelines/types.ts`
- `src/main/pipelines/helpers.ts`
- `src/main/db/index.ts`
- `src/main/queue/worker.ts`
- `tests/unit/pipeline-contract.test.ts`
- `tests/unit/pipeline-logging.test.ts`

## 示例

- “给 `native` 新增一个真实 step 前，先检查 `spec.md` 是否允许新增，再同步更新 pipeline 定义和 `tests/unit/pipeline-contract.test.ts`。”
- “排查任务恢复后又从头开始时，先看 `runner.ts` 是否命中了 `success + artifact exists` 跳过条件，再看 `artifactPath` 是否真实落盘。”
- “实现失败节点重试时，使用 `task:retry-step` 和 `resetStepAndFollowing()`，不要把整任务全量清空后重跑。”
