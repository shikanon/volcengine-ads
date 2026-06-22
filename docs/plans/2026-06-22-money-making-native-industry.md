# Money Making Native Industry Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a `money_making` native/copywriting industry template based on the Lark document's image and video material patterns.

**Architecture:** Reuse the existing `native` workflow instead of adding a new task type. Extend the shared industry enum, workflow definition, validation whitelist, UI industry selector, spec contract, and targeted unit tests so model prompts carry the learned material rules and tests verify recognition behavior.

**Tech Stack:** Electron, TypeScript, React, Vitest, existing Pipeline runner and `ModelClient` abstraction.

---

### Task 1: Update Spec Contract

**Files:**
- Modify: `spec.md`

**Steps:**
1. Add `money_making` to `NativeIndustry`.
2. Add a row in the industry strategy matrix.
3. Update default duration comment to include `money_making: 15..30`.
4. Note the Lark-derived image/video patterns under the industry matrix.

### Task 2: Extend Shared Industry Definitions

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/shared/workflows.ts`

**Steps:**
1. Add `money_making` to `NativeIndustry`.
2. Add `NATIVE_INDUSTRY_DEFINITIONS.money_making`.
3. Encode image rules: background/base image, logo/warning text layer, money-making inspiration atom, red/yellow reward visuals, big selling-point poster, multi-selling-point overlay.
4. Encode video rules: big-character scrolling videos, reward creative effects, UGC reward overlays, real-person speech/interview/skit trust building.
5. Keep prompt output contract unchanged.

### Task 3: Accept New Industry In Validation

**Files:**
- Modify: `src/main/validation.ts`
- Test: `tests/unit/validation.test.ts`

**Steps:**
1. Include `money_making` in `NATIVE_INDUSTRIES`.
2. Keep duration max at 30 seconds like game/social/tool/ecommerce.
3. Add a positive validation test for native `money_making`.
4. Add a copywriting validation test proving `money_making` is recognized through `CopywritingIndustry`.

### Task 4: Verify Prompt Recognition And Pipeline Tags

**Files:**
- Test: `tests/unit/native-pipeline.test.ts`

**Steps:**
1. Add a unit test that runs the native workflow using `money_making`.
2. Assert final assets are tagged `['native', 'money_making']`.
3. Assert at least one generated Seedance prompt contains the money-making material rules such as reward atom, big-character poster/video, UGC overlay, and trust-building real-person routines.

### Task 5: Run Focused And Full Checks

**Commands:**
- `npm test -- tests/unit/validation.test.ts tests/unit/native-pipeline.test.ts`
- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`

**Expected:** All checks pass. If unrelated existing dirty changes break full checks, report the failing command and focused test status.
