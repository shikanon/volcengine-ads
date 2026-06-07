# Tasks
- [x] Task 1: 盘点项目能力并映射 skill 清单。
  - [x] SubTask 1.1: 以 `AGENTS.md`、`spec.md`、`src/shared/types.ts`、`src/renderer/App.tsx` 为依据，确认业务能力与工程能力边界。
  - [x] SubTask 1.2: 为每项能力确定唯一 skill 名称、目标用户、调用时机和对应代码来源。
  - [x] SubTask 1.3: 输出业务 skill 与工程 skill 的最终目录清单，避免重叠和职责不清。

- [x] Task 2: 建立 skills 目录与统一模板。
  - [x] SubTask 2.1: 在 `.trae/skills/` 下为每个 skill 创建独立目录。
  - [x] SubTask 2.2: 为每个 skill 创建 `SKILL.md`，统一 frontmatter、章节结构和引用格式。
  - [x] SubTask 2.3: 在模板中固定“做什么”和“什么时候调用”的描述要求。

- [x] Task 3: 编写 5 个业务 skill。
  - [x] SubTask 3.1: 编写 `ad-copywriting`，覆盖行业路由、模板优化、联网调研、需求拆解、策略分析、脚本输出。
  - [x] SubTask 3.2: 编写 `ad-explosion`，覆盖素材理解、脚本改写、脚本确认、提示词优化与裂变视频生成。
  - [x] SubTask 3.3: 编写 `ad-native`，覆盖六行业原生素材生成全链路。
  - [x] SubTask 3.4: 编写 `ad-pretrailer`，覆盖前贴类型、原片理解、钩子生成、分镜生成与前贴拼接。
  - [x] SubTask 3.5: 编写 `ad-avatar`，覆盖数字人校验、商品理解、口播脚本、视频生成与成片要求。

- [x] Task 4: 编写 6 个工程 skill。
  - [x] SubTask 4.1: 编写 `pipeline-orchestrator`，说明 step、artifact、进度、断点续跑和失败处理。
  - [x] SubTask 4.2: 编写 `model-client-integration`，说明统一外呼入口、限流、重试、错误分类与 mock 要求。
  - [x] SubTask 4.3: 编写 `media-composer`，说明 FFmpeg、媒体拼接、音视频处理与产物路径规则。
  - [x] SubTask 4.4: 编写 `queue-recovery`，说明任务恢复、重试跳过 success step 与 worker 约束。
  - [x] SubTask 4.5: 编写 `test-and-release-checks`，说明 typecheck、lint、test、build 与 PR checklist。
  - [x] SubTask 4.6: 编写 `codex-diagnosis`，说明如何基于现有诊断能力定位 pipeline、模型和任务失败问题。

- [x] Task 5: 校验所有 skill 的格式与内容一致性。
  - [x] SubTask 5.1: 检查每个 skill 都有正确的 frontmatter、调用时机、输入输出、边界与示例。
  - [x] SubTask 5.2: 检查所有 step、任务类型、路径和命令均与仓库当前实现一致。
  - [x] SubTask 5.3: 对照 `AGENTS.md` 的开发与验证规范，补齐缺失约束。

- [x] Task 6: 修复工程 skill 模板不完整的问题。
  - [x] SubTask 6.1: 为 `pipeline-orchestrator`、`model-client-integration`、`media-composer`、`queue-recovery`、`test-and-release-checks`、`codex-diagnosis` 补齐显式“输入信息/输出结果”章节，满足 `spec.md` 对 SKILL 正文结构的要求。
  - [x] SubTask 6.2: 统一工程 skill 的章节命名与模板，避免继续用“先加载哪些上下文”替代输入、遗漏输出结果。

- [x] Task 7: 修复与仓库真实约束不一致的 skill 内容。
  - [x] SubTask 7.1: 修正 `ad-avatar`、`ad-native` 中“本地 TTS”表述，与 `AGENTS.md` 的云端推理约束及 `src/main/model-client/**` 的 `ModelClient.tts()` 实现保持一致。
  - [x] SubTask 7.2: 修正 `ad-explosion` 对最终音频行为的描述，明确多段场景当前通过 `concatSilentVideos()` 拼接，不能表述为“最终视频始终直出带声音”。
  - [x] SubTask 7.3: 修正 `media-composer` 对媒体处理边界的说明，补上与 `AGENTS.md`、`spec.md` 中 Utility Process 约束的对照或偏差说明，避免继续固化错误边界。

- [x] Task 8: 修复工程 skill 文档尾部残留的终端输出，恢复 SKILL 正文格式一致性。
  - [x] SubTask 8.1: 清理 `pipeline-orchestrator`、`model-client-integration`、`queue-recovery`、`test-and-release-checks`、`codex-diagnosis` 的 `SKILL.md` 尾部 shell 残留文本，确保文件以正文或示例自然结束。
  - [x] SubTask 8.2: 重新执行 `.trae/skills/**/SKILL.md` 全量检查，确认 frontmatter、章节结构、引用来源与正文内容均无终端污染。
  - [x] SubTask 8.3: 复核 `Task 5`，仅在格式与内容一致性全部通过后再勾选其子任务。

# Task Dependencies
- `Task 2` depends on `Task 1`
- `Task 3` depends on `Task 1` and `Task 2`
- `Task 4` depends on `Task 1` and `Task 2`
- `Task 5` depends on `Task 3` and `Task 4`
- `Task 8` depends on `Task 5`

# Notes
- `Task 3` 与 `Task 4` 可并行执行。
- 若实现时发现某项 skill 无法在当前代码中找到真实依据，必须先回到规格或与用户确认，不能编造内容。
- `Task 5` 与 `Task 8` 已完成：5 个工程 skill 的终端残留文本已清理，`.trae/skills/**/SKILL.md` 已重新复核通过，frontmatter、章节结构、引用来源与正文内容均与当前仓库实现保持一致。
