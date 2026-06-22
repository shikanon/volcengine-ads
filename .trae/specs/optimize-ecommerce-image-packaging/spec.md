# 电商图片包装方案优化 Spec

## Why
当前 `ecommerce_image` 已实现从商品图理解、文案生成、主图美化、背景替换到文案渲染的闭环，但仍偏“最小可用链路”。为了提升实际投放素材的可控性、可追溯性和失败恢复能力，需要补充轻量优化，而不是引入本地 OCR、抠图模型或复杂模板系统。

## 当前方案评审
- 优点：已作为一级任务类型接入队列、Pipeline、UI、素材库和测试；所有重型 AI 调用均经 `ModelClient`，符合主进程职责边界。
- 风险 1：`copy_render` 直接让图像模型写文字，若出现错别字/乱码，当前只能人工打开最终图发现，缺少结构化渲染计划和质量记录。
- 风险 2：背景替换和文案渲染的每张图只记录 prompt 与路径，缺少每个变体的输入依赖、风格、文案、质量状态和失败原因汇总。
- 风险 3：`copy_generate` 只强校验标题、副标题和关键词存在；当关键词为空、徽标过长或固定文案未被采纳时，兜底策略不够明确。
- 风险 4：主图美化、背景替换、文案渲染均为图像生成调用；`variantCount=5` 时至少 11 次模型调用，UI 没有明确提示成本和耗时。
- 风险 5：素材库仅登记最终图，用户无法快速定位主图美化结果和背景替换中间结果，不利于判断问题出在哪一步。

## What Changes
- 为 `ecommerce_image` 增加结构化 `render_plan.json`，在最终图生成前沉淀文案布局、关键词强调、颜色策略和每个变体的渲染约束。
- 为 `finals.json` 增加每个最终图的质量元信息，包括源背景、文案、关键词、风险提示、生成状态和可读的质量说明。
- 增强 `copy_generate` 的兜底规则：固定文案优先被纳入 headline 或 badge；关键词为空时从商品名/品类/卖点生成最小关键词；徽标长度做截断或丢弃。
- 在 UI 中增加成本/耗时提示和产物说明，明确一次任务会执行主图美化、背景替换和文案渲染多次图像生成。
- 让素材库额外登记 `beautified.png` 与 `background_variant_<i>.png` 为中间 `image` 产物，并通过 tags 区分 `beautified`、`background`、`final`。
- 不新增本地模型、不新增数据库字段、不改变现有 IPC channel、不改变 `ecommerce_image` 的五步 Pipeline 名称。

## Impact
- Affected specs: `ecommerce_image` 电商图片包装、素材库产物登记、工作流产物契约。
- Affected code:
  - `src/main/pipelines/ecommerce-image/index.ts`
  - `src/renderer/pages/EcommerceImage.tsx`
  - `src/shared/workflows.ts`
  - `tests/unit/ecommerce-image-pipeline.test.ts`
  - `tests/unit/pipeline-contract.test.ts`
  - `tests/e2e/workflows.spec.ts`
  - `spec.md`

## ADDED Requirements

### Requirement: 渲染计划产物
The system SHALL generate a structured `render_plan.json` artifact before final ecommerce image rendering.

#### Scenario: 渲染计划生成成功
- **WHEN** `copy_generate` and `background_replace` have both completed
- **THEN** the system SHALL create `render_plan.json`
- **AND** it SHALL include headline, subHeadline, badges, emphasized keywords, color strategy, layout constraints, and one render plan item per background variant

#### Scenario: 关键词为空时兜底
- **WHEN** the model returns no valid keywords in `copy_generate`
- **THEN** the system SHALL derive at least one noun keyword from product name, category, or selling points
- **AND** the downstream render plan SHALL still be generated

### Requirement: 最终图片质量元信息
The system SHALL record quality and traceability metadata for each final ecommerce image.

#### Scenario: 最终图片生成成功
- **WHEN** `copy_render` creates `final_<i>.png`
- **THEN** `finals.json` SHALL include the final path, source background path, render prompt, headline, subHeadline, badges, emphasized keywords, status, and quality notes

#### Scenario: 单张最终图失败
- **WHEN** rendering one final image fails after upstream steps succeeded
- **THEN** the task SHALL fail or pause using existing Pipeline runner behavior
- **AND** the error message SHALL identify the failed variant index

### Requirement: 中间图片素材登记
The system SHALL register useful ecommerce image intermediate artifacts in the asset library.

#### Scenario: 主图美化成功
- **WHEN** `main_image_beautify` succeeds
- **THEN** `beautified.png` SHALL be registered as an `image` asset
- **AND** tags SHALL include `ecommerce_image`, `beautified`, and the selected style

#### Scenario: 背景替换成功
- **WHEN** `background_replace` creates `background_variant_<i>.png`
- **THEN** each background variant SHALL be registered as an `image` asset
- **AND** tags SHALL include `ecommerce_image`, `background`, and the selected style

### Requirement: UI 成本与产物提示
The system SHALL explain the ecommerce image workflow cost and output structure before task creation.

#### Scenario: 用户打开电商图片包装页
- **WHEN** the page loads
- **THEN** the UI SHALL explain that one task performs one main-image beautification, `variantCount` background generations, and `variantCount` final render generations
- **AND** the UI SHALL explain that intermediate and final images can be found in the local asset library

## MODIFIED Requirements

### Requirement: 电商图片包装 Pipeline
The system SHALL keep the existing five step names: `product_understand`, `copy_generate`, `main_image_beautify`, `background_replace`, `copy_render`.

#### Scenario: Step contract remains stable
- **WHEN** `getStepNames('ecommerce_image')` is called
- **THEN** the returned steps SHALL remain exactly `product_understand`, `copy_generate`, `main_image_beautify`, `background_replace`, `copy_render`

### Requirement: 文案生成输出规范
The system SHALL normalize model-produced ecommerce copy before writing it to downstream artifacts.

#### Scenario: 文案模型返回过长徽标
- **WHEN** the model returns badges longer than the UI-safe limit
- **THEN** the system SHALL truncate or drop unsafe badges
- **AND** it SHALL record the normalized badges in `copy.json`

#### Scenario: 固定套路文案存在
- **WHEN** user provides `fixedCopy`
- **THEN** the system SHALL preserve it in headline or badges when possible
- **AND** if it is not used verbatim, `copy.json` SHALL retain enough context for audit through riskControl or style hints

## REMOVED Requirements
无。
