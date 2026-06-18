# 电商短剧组合式裂变 PRD Spec

## Why
当前“广告爆款裂变”只能从单条原视频改写并生成若干变体，缺少电商和短剧行业常用的“素材槽位组合式裂变”能力。图 1 和图 2 展示的裂变方法本质是把前贴、商品/剧情高光、利益点、解说、卡点、BGM 等素材槽位结构化，再通过组合与 FFmpeg 拼接快速生成大量差异化视频。

## Product Goals
- 面向电商和短剧两个行业，在现有爆款裂变入口中增加组合式裂变模式。
- 支持用户看到每种模式的槽位、素材数量和可产出组合估算，帮助选择适合的裂变策略。
- 输出仍以 `variantCount` 控制实际生成条数，组合估算只用于展示和抽样，不一次性生成 600/1500 条。
- 视频拼接、BGM 混合、缺失音轨补齐统一收敛到 FFmpeg 媒体层。

## What Changes
- 在 `explosion` 任务输入中增加可选的行业裂变配置，支持 `ecommerce` 和 `short_drama`。
- 增加电商裂变模式：
  - 痛点前贴裂变：`3秒痛点前贴 + 产品高光 + 利益点结尾 + BGM`
  - 利益点裂变：`产品高光 + 利益点A/B/C + 行动引导 + BGM`
  - 实拍数字人裂变：`AI数字人口播 + 实拍空镜 + 产品特写 + BGM`
  - 顺序混剪裂变：`固定首尾 + 中间打乱 + BGM`
- 增加短剧裂变模式：
  - 顺势二创：`高光1 + 高光2 + 高光3`
  - 前贴二创：`3秒前贴 + 高光1 + 高光2 + BGM`
  - 解说二创：`解说 + 原片高光 + BGM`
  - 卡点混剪：`卡点1 + 卡点2 + 卡点3 + BGM`
- 在 UI 中展示行业、模式、槽位素材数量和组合估算，例如 `5 × 10 × 4 × 3 = 600`。
- Pipeline 在脚本解析和改写阶段识别槽位角色，并在视频生成后使用 FFmpeg 拼接为最终成片。
- 不改变现有无行业裂变配置的 `explosion` 默认行为。

## Impact
- Affected specs: `explosion` 爆款裂变、FFmpeg 媒体拼接、脚本文案确认、视频提示词优化。
- Affected code:
  - `src/shared/types.ts`
  - `src/shared/workflows.ts`
  - `src/renderer/pages/Explosion.tsx`
  - `src/main/pipelines/explosion/index.ts`
  - `src/main/media/ffmpeg.ts`
  - `tests/unit/explosion-pipeline.test.ts`
  - `tests/unit/ffmpeg-audio-concat.test.ts`

## ADDED Requirements
### Requirement: 行业组合式裂变配置
The system SHALL allow `explosion` tasks to optionally carry an industry fission configuration for ecommerce or short drama.

#### Scenario: 默认裂变不受影响
- **WHEN** user creates an explosion task without industry fission configuration
- **THEN** the system SHALL keep the existing download, ASR, script parse, rewrite, script confirmation, video prompt optimize and Seedance generation behavior.

#### Scenario: 用户选择电商裂变模式
- **WHEN** user selects ecommerce fission in the explosion page
- **THEN** the system SHALL show ecommerce modes and their required slots: pain pretrailer, product highlight, benefit/offer point, action guidance, digital human, real-shot ambience, product close-up, fixed intro/outro and BGM as applicable.

#### Scenario: 用户选择短剧裂变模式
- **WHEN** user selects short drama fission in the explosion page
- **THEN** the system SHALL show short drama modes and their required slots: highlight clips, 3-second pretrailer, commentary, original highlights, beat clips and BGM as applicable.

### Requirement: 组合估算
The system SHALL calculate a combination estimate from available slot counts for the selected fission mode.

#### Scenario: 电商痛点前贴裂变估算
- **WHEN** pain pretrailer has 5 options, product highlight has 10 options, benefit ending has 4 options and BGM has 3 options
- **THEN** the system SHALL display `5 × 10 × 4 × 3 = 600`.

#### Scenario: 短剧前贴二创估算
- **WHEN** pretrailer material has 5 options, highlight slot 1 has 10 options, highlight slot 2 has 10 options and BGM has 3 options
- **THEN** the system SHALL display `5 × 10 × 10 × 3 = 1500`.

### Requirement: 槽位角色与组合抽样
The system SHALL represent each fission mode as ordered slots and sample concrete combinations up to `variantCount`.

#### Scenario: 生成数量低于组合总数
- **WHEN** the estimated combination count is greater than `variantCount`
- **THEN** the system SHALL select diverse combinations and generate only `variantCount` final videos.

#### Scenario: 槽位素材不足
- **WHEN** a required slot has no user-provided material and cannot be generated from the source video
- **THEN** the system SHALL fail validation with a clear Chinese error that names the missing slot.

### Requirement: FFmpeg 拼接成片
The system SHALL compose industry fission videos through FFmpeg after slot clips are prepared.

#### Scenario: 拼接多个视频槽位
- **WHEN** a sampled combination contains multiple video clips
- **THEN** the system SHALL normalize compatible dimensions and concatenate clips through `src/main/media/ffmpeg.ts`.

#### Scenario: 拼接 BGM
- **WHEN** a sampled combination contains BGM
- **THEN** the system SHALL mix or replace background audio through FFmpeg while preserving generated voice where applicable and adding silence fallback when clips have no audio.

### Requirement: 产物记录
The system SHALL persist fission mode, sampled slot combination and final output paths for each variant.

#### Scenario: 任务完成
- **WHEN** an industry fission task succeeds
- **THEN** the system SHALL write the selected combinations into `seedance_outputs.json` or a dedicated composition artifact and register each final video as an asset.

## MODIFIED Requirements
### Requirement: ExplosionInput
`ExplosionInput` SHALL accept an optional fission configuration while preserving existing required fields.

```typescript
type FissionIndustry = 'ecommerce' | 'short_drama';
type EcommerceFissionMode =
  | 'pain_pretrailer'
  | 'benefit_point'
  | 'realshot_digital_human'
  | 'sequence_remix';
type ShortDramaFissionMode =
  | 'trend_remix'
  | 'pretrailer_remix'
  | 'commentary_remix'
  | 'beat_cut';

interface ExplosionFissionConfig {
  industry: FissionIndustry;
  mode: EcommerceFissionMode | ShortDramaFissionMode;
  slotAssetPaths?: Partial<Record<string, string[]>>;
  bgmPaths?: string[];
}
```

### Requirement: Explosion workflow
The explosion workflow SHALL keep its existing nodes and extend `script_parse`, `rewrite`, `video_prompt_optimize` and `seedance` behavior only when `fissionConfig` is present.

### Requirement: FFmpeg media layer
The media layer SHALL provide or reuse functions for concatenating multiple video clips and combining BGM without duplicating raw FFmpeg command construction inside pipeline code.

## REMOVED Requirements
None.

