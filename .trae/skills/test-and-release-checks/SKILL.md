---
name: "test-and-release-checks"
description: "说明本仓库交付前的 typecheck、lint、unit/e2e test、build 和 PR checklist。用户要求自验、回归、发版前检查或补测试时调用。"
---

# Test And Release Checks

## 能力说明

用于在本仓库中做修改后的自验、回归和交付前检查。它关注的是“这次改动应该验证到什么程度”，以及“发版前必须跑哪些命令”。

## 何时调用

- 用户要求“自验一下”“帮我跑测试”“给出 release 前检查项”。
- 你修改了主进程、pipeline、model-client、queue、db、媒体处理等核心代码。
- 你要判断这次变更是否需要补单测或 E2E。
- 你准备提交、发版或给出最终交付结论。

不适合：

- 仅在探索代码，还未产生任何变更。
- 仅排查某个单一错误细节，而不是做完整验收。

## 输入信息

- 用户目标：执行自验、判断测试范围、确认发布前检查项，或解释为什么某次变更可以跳过部分验证。
- 变更范围：涉及的目录、是否属于运行时代码、是否影响 IPC、schema、依赖、构建或外部模型调用。
- 必读上下文：
  - `AGENTS.md` §4 开发命令、§9 测试要求、§10.3 PR Checklist
  - `package.json`
  - 改动附近已有测试文件
  - `tests/e2e/workflows.spec.ts`
- 关键输入事实：
  - 仓库交付前标准命令是 `npm run typecheck && npm run lint && npm test && npm run build`
  - 纯文档或说明文字变更，可以说明原因后跳过打包验证
  - 重点单测模块包括 `src/main/model-client/**`、`src/main/pipelines/**`、`src/main/db/**`、`src/main/queue/recover.ts`
  - 当前 E2E 仍较轻量，不能把现状说成“已完全覆盖发布风险”

## 执行步骤

1. 先判断本次改动是运行时代码、测试代码还是纯文档，再决定验证深度。
2. 若修改了核心模块，先跑最相关单测，再跑 `npm run typecheck` 与 `npm run lint`，最后再跑 `npm test` 和 `npm run build`。
3. 若修改涉及 `ModelClient`、pipeline step 顺序、queue/recovery、数据库状态迁移或 FFmpeg 兼容行为，优先考虑补或更新单测。
4. 若用户要求交付结论，按 `AGENTS.md` 的发布要求对照 `typecheck`、`lint`、`test`、`build` 和 PR checklist 给出结果，不夸大未覆盖的范围。
5. 若仅改文档或 workspace skill，检查 Markdown 结构、路径引用和任务清单即可，并在交付说明里写清楚为什么未跑完整构建。
6. 若涉及 IPC channel、schema、spec 或依赖变化，把对应的 checklist 项一并纳入说明，不遗漏迁移、规格同步或打包验证。

## 输出结果

- 一份与本次改动范围匹配的验证计划，明确先跑哪些相关测试、是否需要全量测试、是否需要构建验证。
- 一份可直接交付的自验结果，说明哪些命令已执行、哪些未执行、失败或跳过的原因是什么。
- 一份发布前检查结论，覆盖 `typecheck`、`lint`、`test`、`build` 与 PR checklist 的状态。
- 如需补测试，明确指出应补哪类单测或 E2E，而不是只给泛泛建议。

## 关键约束

- 不能因为“只是小改”就跳过核心验证而不说明。
- 不能把 E2E 缺失说成“已经完全覆盖”。
- 不能对外呼模型的单测走真实网络。
- 不能在打包失败时仍声称 release ready。
- 不能新增核心行为却不考虑是否补测试。

## 验证与交付

常用命令以 `package.json` 为准：

- `npm run typecheck`
- `npm run lint`
- `npm run lint:fix`
- `npm test`
- `npm run test:watch`
- `npm run test:coverage`
- `npm run test:e2e`
- `npm run build`
- `npm run build:release`
- `npm run build:all`

PR Checklist：

- `npm run typecheck` 通过
- `npm run lint` 通过
- `npm test` 通过
- 非纯文档改动时 `npm run build` 通过
- 没有提交密钥、Token、凭证等敏感信息
- 若新增或修改 IPC channel，已同步 `src/shared/ipc-channels.ts`
- 若涉及 schema 变更，已新增 migration
- 若涉及 spec 行为变更，已同步 `spec.md`
- 新增模块时附带最小单测
- 影响打包或依赖时，本地已验证 `npm run build`

## 引用来源

- `AGENTS.md`
- `package.json`
- `tests/unit/**`
- `tests/e2e/workflows.spec.ts`

## 示例

- “改了 `native.asset_generator` 后，至少考虑 `tests/unit/native-pipeline.test.ts`、必要时的 `pipeline-contract`，再执行 `typecheck`、`lint`、`test`、`build`。”
- “只写了 workspace skill 文档时，可以说明本次仅修改 `.trae/skills/**` 和任务清单，未改运行时代码，因此未执行 `npm run build`。”
- “改了模型入参校验时，优先跑输入校验相关单测，而不是只跑全量 build。”
