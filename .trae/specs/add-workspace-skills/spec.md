# Workspace Skills Spec

## Why
当前项目已经有明确的产品能力和工程能力，但这些知识主要分散在 `AGENTS.md`、`spec.md`、`src/**` 与工作流定义中，缺少可直接被 `codex` 或 `claude code` 调用的 skill 资产。
把这些能力沉淀为 workspace skills 后，可以让后续 Agent 在执行广告生成、工作流调整、模型接入、排障与验收时直接复用统一方法，减少重复解释和上下文装载成本。

## What Changes
- 在工作区新增统一的 skills 目录约定，用于存放可被 `codex` 或 `claude code` 读取的 skill。
- 将当前项目的一级任务能力拆分为独立业务 skill：文案脚本、爆款裂变、原生爆款、广告前贴、数字人口播。
- 将当前项目的通用实现能力拆分为独立工程 skill：工作流编排、模型接入、媒体处理、任务恢复与队列、测试与验收、故障诊断。
- 为每个 skill 规定固定文件结构、frontmatter 字段、触发条件、输入输出、约束边界和示例用法。
- 明确 skill 内容必须以本仓库约束为准，引用 `spec.md`、`AGENTS.md`、`src/**` 的真实路径，不得编造流程或 step。

## Impact
- Affected specs: 项目能力沉淀、Agent 协作方式、工作流知识复用、任务执行规范
- Affected code: `.trae/skills/**/SKILL.md`、`.trae/specs/add-workspace-skills/*`、现有 `AGENTS.md` 与 `spec.md` 作为 skill 来源约束

## ADDED Requirements
### Requirement: Workspace Skills 目录
系统 SHALL 在工作区提供统一的 skills 目录，用于存放可被 `codex` 或 `claude code` 直接使用的 skill 定义。

#### Scenario: 创建 skills 目录结构
- **WHEN** 本变更进入实现阶段
- **THEN** 系统在仓库内创建 `.trae/skills/`
- **AND** 每个 skill 使用独立子目录
- **AND** 每个 skill 子目录内包含唯一的 `SKILL.md`

### Requirement: 业务能力拆分为独立 Skill
系统 SHALL 把当前项目的一级业务能力拆分为多个独立 skill，而不是合并成单一的“大而全”说明文档。

#### Scenario: 生成业务 skill 清单
- **WHEN** 实现本变更
- **THEN** 至少提供以下 skill：`ad-copywriting`、`ad-explosion`、`ad-native`、`ad-pretrailer`、`ad-avatar`
- **AND** 每个 skill 说明其适用场景、触发条件、输入约束、关键 pipeline step、产物和禁止事项
- **AND** 每个 skill 必须说明与 `spec.md` 中对应任务类型的关系

### Requirement: 通用工程能力拆分为独立 Skill
系统 SHALL 把跨业务复用的工程能力拆分为独立 skill，供 Agent 在实现和维护阶段复用。

#### Scenario: 生成工程 skill 清单
- **WHEN** 实现本变更
- **THEN** 至少提供以下 skill：`pipeline-orchestrator`、`model-client-integration`、`media-composer`、`queue-recovery`、`test-and-release-checks`、`codex-diagnosis`
- **AND** 每个 skill 必须描述何时调用，而不是只描述能做什么
- **AND** 每个 skill 必须包含与本仓库约束一致的操作边界

### Requirement: Skill 元数据完整
系统 SHALL 为每个 skill 提供可被 Agent 正确识别的元数据和正文结构。

#### Scenario: 校验 SKILL.md 格式
- **WHEN** 检查任意一个 `SKILL.md`
- **THEN** 文件顶部包含 `name` 和 `description` frontmatter
- **AND** `description` 同时说明“这个 skill 做什么”和“什么时候调用”
- **AND** 正文至少包含：能力说明、适用时机、输入信息、执行步骤、输出结果、引用来源、示例

### Requirement: Skill 内容必须绑定仓库真实约束
系统 SHALL 确保每个 skill 的说明与本仓库真实实现和规格保持一致，避免脱离代码的泛化建议。

#### Scenario: 业务 skill 引用真实流程
- **WHEN** Agent 打开任意广告业务 skill
- **THEN** 能看到对应的任务类型、页面入口、相关 `src/main/pipelines/**` 路径和关键 step
- **AND** 若该能力要求脚本文案确认、分辨率参数、视频提示词优化或合规节点，skill 中必须明确写出
- **AND** skill 中不得出现与当前 `spec.md` 冲突的 step 名称或职责

#### Scenario: 工程 skill 引用真实边界
- **WHEN** Agent 打开任意工程 skill
- **THEN** 能看到主进程、渲染进程、共享层的职责边界
- **AND** 能看到测试、打包、错误处理、IPC、ModelClient 等项目约束
- **AND** skill 中不得建议直接跨层 import 或绕开 `src/shared/ipc-channels.ts`

### Requirement: Skills 面向 Codex 与 Claude Code 可读
系统 SHALL 使每个 skill 对 `codex` 和 `claude code` 都足够直接、可执行和低歧义。

#### Scenario: Agent 读取 skill 并执行
- **WHEN** `codex` 或 `claude code` 读取某个 skill
- **THEN** 能从 skill 中直接判断是否应调用该 skill
- **AND** 能获得最小必要上下文装载顺序
- **AND** 能根据 skill 中的操作步骤继续展开实现、修改或排查工作

## MODIFIED Requirements
### Requirement: 项目知识复用方式
系统 SHALL 优先通过 workspace skills 复用项目能力说明；`AGENTS.md` 和 `spec.md` 继续作为事实来源，但不再要求每次任务都由人手动重复解释完整上下文。

## REMOVED Requirements
### Requirement: 无
**Reason**: 本变更是新增 skill 资产，不移除现有产品或实现能力。
**Migration**: 无。
