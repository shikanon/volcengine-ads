# 客户侧 Skills 目录迁移 Spec

## Why
当前项目 skills 已迁移到仓库根目录 `skills/`。用户明确这些 skill 是给客户使用的项目能力说明，不是给开发工具内部使用的资产，因此应位于项目根目录下的显式客户可见目录。

## What Changes
- 将旧隐藏目录下的客户可见 skill 迁移到仓库根目录 `skills/`。
- 保留每个 skill 的独立目录和 `SKILL.md` 结构。
- 更新引用旧隐藏目录的项目说明或索引文字，避免继续把客户侧 skill 描述成开发工具资产。
- 删除迁移后的旧隐藏源目录，避免同一份客户文档在两个位置重复维护。
- 不修改 `.trae/specs/**` 历史规格文档；它们作为变更记录保留。

## Impact
- Affected specs: workspace skills 资产位置、客户可见项目文档组织。
- Affected code: `skills/**`、可能引用旧路径的 `AGENTS.md` 或 README 文档。

## ADDED Requirements
### Requirement: 客户可见 skills 目录
The system SHALL store customer-facing skills under the repository root `skills/` directory.

#### Scenario: 客户查看项目能力说明
- **WHEN** a customer opens the project repository
- **THEN** they SHALL find the skill documents in `skills/`
- **AND** the directory SHALL not be hidden under `.trae/`.

### Requirement: 保持 skill 结构
The system SHALL preserve the current skill structure during migration.

#### Scenario: 迁移单个 skill
- **WHEN** `ad-explosion` is moved
- **THEN** it SHALL remain available as `skills/ad-explosion/SKILL.md`
- **AND** its existing content SHALL not be rewritten unless path references need updating.

### Requirement: 避免重复维护
The system SHALL remove the old hidden skills directory after successful migration.

#### Scenario: 迁移完成
- **WHEN** all skill directories are available under `skills/`
- **THEN** the old hidden skills directory SHALL no longer contain duplicate skill documents.

## MODIFIED Requirements
### Requirement: Workspace skills 位置
系统 SHALL 把客户侧 skill 的事实位置调整为 `skills/`。历史 `.trae/specs/add-workspace-skills/*` 不回写修改，仅作为原始变更记录保留。

## REMOVED Requirements
### Requirement: 客户侧 skill 存放在旧隐藏目录
**Reason**: `.trae` 是开发工具/Agent 隐藏目录语义，不符合客户可见文档资产定位。
**Migration**: 将旧隐藏目录中的 skill 文档移动到 `skills/**`，并更新当前项目说明中的旧路径引用。
