# Ecommerce Native Asset State Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 优化电商原生广告生成链路中 `asset_generator` 的中间态语义，避免片段生成进度被误统计为最终失败。

**Architecture:** 电商广告属于 `native` 六行业工作流，复用 `src/main/pipelines/native/index.ts` 的 `asset_generator`。本次保持现有 step 名称、artifact 路径和模型调用契约不变，只在 `assets.json` 快照中增加可选 `phase` 字段，并让最终失败统计只依据 `status: 'failed'`。

**Tech Stack:** Electron main process, TypeScript strict mode, Vitest, existing `ModelClient` and FFmpeg mocks.

---

### Task 1: 明确中间态契约

**Files:**
- Modify: `src/main/pipelines/native/index.ts`
- Test: `tests/unit/native-pipeline.test.ts`

**Step 1: Write the failing test**

新增一个 `asset_generator` 单测：构造 25s 电商 native storyboard，第一段生成成功、第二段生成失败。断言 `assets.json` 中该变体为 `status: 'failed'` 且仅最终失败进入 summary；中间片段进度使用 `phase: 'generating_segments'`，不会被当作最终失败快照。

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/native-pipeline.test.ts`

Expected: FAIL because current intermediate snapshot has no `phase` and uses `status: 'failed'` for progress.

**Step 3: Write minimal implementation**

在 `NativeAsset` 增加可选 `phase: 'generating_segments' | 'composing' | 'completed' | 'failed'`。调整 `buildNativeAssetSnapshot` 支持 `status` 可选、`phase` 必填或可选；片段进度记录只写 `phase: 'generating_segments'`，最终失败才写 `status: 'failed'`。

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/native-pipeline.test.ts`

Expected: PASS.

### Task 2: 回归全量质量门禁

**Files:**
- Verify only

**Step 1: Run required checks**

Run: `npm run typecheck && npm run lint && npm test && npm run build`

Expected: all commands pass.

**Step 2: Commit and push**

Run: `git status --short`, review touched files, then commit only this task's files and push current branch.
