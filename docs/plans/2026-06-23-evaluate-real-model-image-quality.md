# Real Model Image Quality Evaluation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a safe local loop for generating and evaluating real money-making image samples with `.env.local`.

**Architecture:** Add a local-only Node script that reads image model config from `.env.local`, generates three representative Seedream samples, writes images and non-secret metadata under `tmp/real-model-image-quality`, and optionally records VLM evaluation when an LLM key is configured. Keep default unit tests mocked and CI-safe.

**Tech Stack:** Node.js ESM, `undici.fetch`, existing Ark-compatible image API, Vitest for prompt/contract checks.

---

### Task 1: Local Evaluation Entry

**Files:**
- Create: `scripts/evaluate-real-model-image-quality.mjs`
- Modify: `package.json`

**Steps:**
1. Add `.env.local` parser that accepts `IMAGE_API_KEY` or `ARK_API_KEY`, `IMAGE_BASE_URL`, and `IMAGE_MODEL`.
2. Fail fast in Chinese when required non-secret keys are missing.
3. Add `npm run test:real:image-quality` so the flow is explicit and excluded from `npm test`.

### Task 2: Sample Generation And Report

**Files:**
- Modify: `scripts/evaluate-real-model-image-quality.mjs`

**Steps:**
1. Define three cases: reward atom, big-character poster, and UGC reward overlay.
2. Generate PNG samples via `/images/generations` with a generated local reference image.
3. Save `metadata.json`, `report.md`, prompts, model name, image paths, and timestamps without secrets.

### Task 3: Prompt Iteration

**Files:**
- Modify: `src/shared/workflows.ts`
- Modify: `tests/unit/native-pipeline.test.ts` or `tests/unit/pipeline-contract.test.ts`

**Steps:**
1. Strengthen money-making prompt rules around reward atoms, big-character layouts, UGC overlays, trust routines, and prohibited claims.
2. Add focused unit assertions that the default prompt set retains those constraints.
3. Run the focused test and fix regressions.

### Task 4: Local Real-Model Run

**Files:**
- Generated: `tmp/real-model-image-quality/<run-id>/`
- Modify: `.trae/specs/evaluate-real-model-image-quality/checklist.md`

**Steps:**
1. Run `npm run test:real:image-quality` when `.env.local` exists.
2. Review generated images and report.
3. If images are weak, update prompts and rerun with a new prompt version.
4. Check only completed checklist items; record blocker if `.env.local` is absent.

### Task 5: Verification

**Files:**
- Modify: `.trae/specs/evaluate-real-model-image-quality/checklist.md`

**Steps:**
1. Run focused tests.
2. Run `npm run typecheck`.
3. Run `npm run lint`.
4. Run `npm test`.
5. Run `npm run build`.
6. Report generated image paths or the exact local config blocker.
