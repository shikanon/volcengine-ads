# 真实模型图片效果评估与迭代 Spec

## Why
当前单元测试只验证 Prompt、路由和产物契约，不会真实调用模型生成图片，因此无法判断素材视觉效果是否达到预期。需要提供一个安全、可重复的真实模型测试闭环，读取本地 `.env.local` 配置生成样张，并根据效果持续优化提示词和工作流。

## What Changes
- 增加真实模型图片效果测试流程，允许在本地读取 `.env.local` 中的模型配置，但不得打印、提交或写入密钥。
- 使用真实模型生成网赚类测试图片样张，并把样张、Prompt、模型请求摘要和评价结论保存为可追踪产物。
- 建立最小效果评价标准，覆盖网赚素材规律、可读性、合规风险、画面完成度和投放素材可用性。
- 支持多轮迭代：当效果不佳时修改 Prompt 或轻量工作流，再重新生成样张并记录前后对比。
- 不引入本地 GPU 模型、不新增数据库字段、不改变现有 IPC channel。

## Impact
- Affected specs: `native` 网赚行业素材生成、工作流 Prompt、真实模型验收流程。
- Affected code:
  - `src/shared/workflows.ts`
  - `src/main/pipelines/native/index.ts`
  - `src/main/model-client/**`
  - `tests/**`
  - `docs` 或测试产物目录（仅保存非密钥结果）

## ADDED Requirements

### Requirement: 真实模型测试配置读取
The system SHALL support local real-model image generation tests using credentials from `.env.local`.

#### Scenario: 配置读取成功
- **WHEN** the tester runs the real-model image evaluation flow locally
- **THEN** the system SHALL read required model endpoint, model name, and API key from `.env.local`
- **AND** it SHALL NOT print, persist, or commit any secret value

#### Scenario: 配置缺失
- **WHEN** required image model configuration is missing
- **THEN** the flow SHALL fail fast with a Chinese error explaining which non-secret config key is missing
- **AND** it SHALL NOT attempt a network call

### Requirement: 网赚类真实样张生成
The system SHALL generate sample images for the money-making material style using the real image model.

#### Scenario: 样张生成成功
- **WHEN** the tester starts a money-making image evaluation run
- **THEN** the system SHALL generate at least three representative samples:
  - 单卖点红包/金币/宝箱奖励视觉
  - 大字卖点海报式素材
  - 多卖点 UGC 奖励叠加风格
- **AND** each sample SHALL save the image path, prompt, prompt version, model name, and generated timestamp

### Requirement: 效果评价记录
The system SHALL evaluate each generated sample against explicit visual and compliance criteria.

#### Scenario: 效果达到预期
- **WHEN** generated samples satisfy the evaluation criteria
- **THEN** the system SHALL record the result as accepted
- **AND** it SHALL include a concise Chinese explanation of why the effect is acceptable

#### Scenario: 效果不达预期
- **WHEN** any generated sample has obvious issues
- **THEN** the system SHALL record the issue category and evidence
- **AND** it SHALL trigger a prompt or workflow iteration task before final acceptance

### Requirement: 迭代闭环
The system SHALL support repeated prompt/workflow iteration until the generated image quality is acceptable.

#### Scenario: Prompt 迭代
- **WHEN** a sample is rejected due to weak visual focus, missing reward atom, poor layout, or compliance risk
- **THEN** the tester SHALL update the relevant Prompt or lightweight workflow logic
- **AND** the next generation run SHALL save a new versioned result for comparison

#### Scenario: 最终验收
- **WHEN** the tester judges the generated samples are good enough
- **THEN** the final report SHALL include accepted image paths, final prompts, iteration count, remaining risks, and validation commands

## MODIFIED Requirements

### Requirement: 网赚类素材规则
The system SHALL keep money-making material prompts aligned with the learned Lark document patterns.

#### Scenario: Prompt 生成
- **WHEN** the workflow builds money-making image or video generation prompts
- **THEN** the prompt SHALL reference reward visuals, money-making inspiration atoms, big-character selling-point layouts, UGC reward overlays, and trust-building real-person routines where applicable
- **AND** it SHALL avoid guaranteed income, fake withdrawal proof, exaggerated earnings, and misleading download claims

## REMOVED Requirements
无。
