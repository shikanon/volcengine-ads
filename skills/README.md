# Customer Skills

本目录用于沉淀 `volcengine-ads` 的客户可见 skills。当前已完成 skill 清单整理，并为每个 skill 建立统一的 `SKILL.md` 文档。

## 统一约定

- 每个 skill 位于 `skills/<skill-name>/SKILL.md`。
- frontmatter 统一包含 `name` 与 `description`。
- `description` 必须同时回答“做什么”和“什么时候调用”。
- 正文统一包含：能力说明、适用时机、输入信息、执行步骤、输出结果、操作边界、引用来源、示例。
- 所有内容必须引用本仓库真实路径、任务类型、页面入口和 pipeline step，不得编造。

## Skill 清单

| 类别 | Skill | 主要职责 | 主要依据 |
| --- | --- | --- | --- |
| 业务 | ad-copywriting | 覆盖广告文案脚本工作流。用户要从需求生成脚本、调整 copywriting pipeline 或补充脚本文案产物规范时调用。 | `spec.md` 中 `copywriting` 任务类型与 step 约束 |
| 业务 | ad-explosion | 覆盖广告爆款裂变工作流。用户要处理爆款素材裂变、改写脚本、确认脚本或调整裂变视频生成链路时调用。 | `spec.md` 中爆款裂变的脚本确认、视频提示词优化与 Seedance 约束 |
| 业务 | ad-native | 覆盖六行业原生爆款素材生成工作流。用户要新增或修改 native 任务流程、行业路由、合规或成片生成逻辑时调用。 | `spec.md` 中 `native` 输入契约、行业矩阵与 10 个 pipeline step |
| 业务 | ad-pretrailer | 覆盖广告前贴工作流。用户要生成或调整前贴类型、钩子、前贴分镜、拼接链路时调用。 | `spec.md` 中前贴类型、脚本确认、Seedance 直出和 `concat` 约束 |
| 业务 | ad-avatar | 覆盖数字人口播工作流。用户要调整数字人校验、商品理解、口播脚本、TTS 或数字人视频生成时调用。 | `spec.md` 中数字人口播生成、分辨率、脚本确认和视频提示词优化约束 |
| 工程 | pipeline-orchestrator | 覆盖任务 pipeline 编排、step 状态、进度、确认与断点续跑规则。修改 `src/main/pipelines/**`、`runner.ts` 或排查 step 执行顺序与状态流转时调用。 | `AGENTS.md` 中 pipeline 实现规则、artifact 路径和失败处理约束 |
| 工程 | model-client-integration | 覆盖云端模型接入、统一外呼入口、重试限流与错误边界。新增或修改模型调用、webSearch、TTS、视觉理解、视频生成接口时调用。 | `AGENTS.md` 中“所有云端模型调用必须经 `src/main/model-client/` 适配层”与并发/重试约束 |
| 工程 | media-composer | 覆盖 FFmpeg 媒体处理、拼接、抽音、混流和产物路径规则。修改媒体规范化、裁剪、拼接、音视频合成、数字人口播后处理时调用。 | `spec.md` 中 Utility Process、FFmpeg 和媒体产物约束 |
| 工程 | queue-recovery | 覆盖任务暂停、恢复、重试跳过 success step 的队列约束。修改任务恢复、worker 调度、失败后重试或续跑逻辑时调用。 | `AGENTS.md` 中 `src/main/queue/recover.ts` 测试要求与 retry 跳过 success step 约束 |
| 工程 | test-and-release-checks | 覆盖 typecheck、lint、test、build 与 PR checklist。开发完成后自验、补测试、准备提交或确认发布前检查项时调用。 | `AGENTS.md` 中开发命令、测试要求、覆盖率与 PR checklist |
| 工程 | codex-diagnosis | 覆盖 pipeline 失败后的只读诊断流程与诊断文件产出规则。排查 `paused` 任务、读取 `pipeline.log`、分析自动诊断文件或补充失败证据时调用。 | `src/main/pipelines/codex-diagnosis.ts` 中只读诊断命令与诊断文件命名规则 |

## 当前状态

- 已创建 5 个业务 skill 与 6 个工程 skill 的目录。
- 已为全部 skill 写入统一风格的 `SKILL.md` 骨架。
- 详细内容将在后续 Task 3 与 Task 4 继续补全。
