---
name: "queue-recovery"
description: "说明本仓库任务队列、恢复、取消、脚本确认、按 step 重试与启动恢复语义。修改 `src/main/queue/**`、任务状态机或恢复逻辑时调用。"
---

# Queue Recovery

## 能力说明

用于处理任务排队、恢复、取消、脚本确认和按 step 重试。重点不是业务 step 本身，而是任务如何进入队列、暂停、恢复，以及如何跳过已经成功的步骤。

## 何时调用

- 用户要修改任务队列并发、入队、恢复、取消或删除逻辑。
- 用户要实现“从失败 step 重试”或“确认脚本后继续跑”。
- 用户要排查重启后任务状态不对、任务重复执行、成功 step 被错误重跑。
- 用户要改 `src/main/queue/**`、`src/main/ipc/task.ts`、`TaskRepository` 的状态迁移。

不适合：

- 仅修改某个 step 内部算法。
- 仅修改模型接入或媒体处理。

## 输入信息

- 用户目标：修改任务状态机、队列行为、恢复逻辑或排查某次恢复/重试异常。
- 问题范围：任务当前状态、目标 step、是否来自启动恢复、是否来自 `retryTask()` / `retryStep()` / `confirmScript()`、是否涉及删除或取消。
- 必读上下文：
  - `AGENTS.md` §8、§9
  - `spec.md` 中任务状态与确认语义
  - `src/main/queue/worker.ts`
  - `src/main/queue/recover.ts`
  - `src/main/db/index.ts`
  - `src/main/pipelines/runner.ts`
  - `src/main/ipc/task.ts`
  - `src/shared/types.ts`
  - `tests/unit/recover.test.ts`
  - `tests/unit/task-actions.test.ts`
- 关键输入事实：
  - `TaskWorker` 默认 `concurrency = 1`，当前仓库默认串行跑任务
  - 建任务时通过 `getStepNames(task.type)` 一次性固定 step 列表
  - 启动恢复当前只做 `pauseRunningTasks()`，不会自动续跑未完成任务
  - `retryStep()` 真实路径是 `resetStepAndFollowing()`，只重置目标 step 及其后续 step，之前成功 step 保留 `success`
  - `confirmScript()` 会把 `waiting_confirmation` 的 step 改为 `success`，task 改回 `queued`，再重新入队

## 执行步骤

1. 先区分当前问题属于“任务状态机”还是“pipeline 业务逻辑”，避免把 step 内部问题误改到队列层。
2. 读 `src/main/queue/worker.ts`，确认入队守卫和串行执行语义：任务不存在或状态不是 `queued` 时不运行。
3. 读 `src/main/queue/recover.ts` 与 `src/main/db/index.ts`，确认启动恢复仍是“把数据库里仍为 `running` 的任务改为 `paused`”，而不是自动继续执行。
4. 若改失败 step 重试，保留 `retryStep()` -> `resetStepAndFollowing()` -> `enqueue(taskId)` 的路径，不要把整任务全量清空。
5. 若改脚本确认，保留 `confirmWaitingStep()`、task 回到 `queued`、发送进度事件、再次入队的完整闭环。
6. 若改删除或取消，继续使用 `activeTaskIds` 防止运行中删除，且不要把“删除”偷偷实现成隐式取消加强删。
7. 若改仓储状态迁移，联动检查 `tasks` 和 `task_steps` 两张表涉及的方法，避免只改 task 状态或只改 step 状态。
8. 若涉及 IPC，确认 `src/main/ipc/task.ts` 仍只做薄转发，不在 IPC 层实现复杂业务状态机。

## 输出结果

- 一份基于真实代码的队列与恢复语义说明，明确入队、启动恢复、按 step 重试、脚本确认、取消和删除的真实路径。
- 一套围绕 `TaskWorker`、`TaskRepository`、`task` IPC 的修改方案，不绕过现有状态迁移和入队守卫。
- 明确的排障结论，例如“为什么重启后任务还显示 running”“为什么点击重试后从头开始跑”“为什么脚本确认后没有继续执行”。
- 对应的状态迁移影响面，说明哪些 task/step 状态会被修改、哪些会保留原值。

## 关键约束

- 不能让任务在重启后仍保持 `running`。
- 不能把 `retryStep()` 变成整任务全量重跑，除非用户明确要这么做。
- 不能在 `waiting_confirmation` 之外调用确认逻辑。
- 不能删除正在运行或正在停止的任务。
- 不能绕过 `TaskRepository` 直接手写 SQL 到处更新状态。
- 不能让 renderer 自己决定 step 状态迁移。

## 验证与交付

优先跑：

- `tests/unit/recover.test.ts`
- `tests/unit/task-actions.test.ts`
- 若动了 runner 跳过逻辑，再跑相关 pipeline 单测

最终收尾：

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`

## 引用来源

- `AGENTS.md`
- `spec.md`
- `src/main/queue/worker.ts`
- `src/main/queue/recover.ts`
- `src/main/db/index.ts`
- `src/main/ipc/task.ts`
- `src/main/pipelines/runner.ts`
- `src/shared/types.ts`
- `tests/unit/recover.test.ts`
- `tests/unit/task-actions.test.ts`

## 示例

- “实现失败节点重试时，传入 `taskId + stepId`，调用 `repository.resetStepAndFollowing()` 后重新 `enqueue(taskId)`，不要直接把所有 step 全部重置为 `pending`。”
- “应用启动恢复当前只是一层 `pauseRunningTasks()` 薄封装；如果要做自动续跑，必须先确认需求，不能偷偷改掉现有‘启动先暂停’语义。”
- “脚本确认后不继续执行时，先检查 task 是否真是 `waiting_confirmation`、是否存在等待确认的 step、`confirmWaitingStep()` 后 task 是否回到 `queued`、`enqueue(task.id)` 是否实际执行。”
