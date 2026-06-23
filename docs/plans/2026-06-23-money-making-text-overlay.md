# Money Making Text Overlay Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add code-rendered Chinese text overlays to money-making image quality samples so real test images follow the Lark document's layered material workflow.

**Architecture:** Keep real image generation as a local-only evaluation script. Ask the image model for clean no-text base images, then render logo/warning/selling-point copy with local FFmpeg `drawtext` layers and evaluate the final composited PNGs. This avoids relying on the model to draw Chinese text.

**Tech Stack:** Node.js ESM, `undici`, `ffmpeg-static`, FFmpeg `drawtext`, Vitest contract checks.

---

### Task 1: Document Lark Layering Rule

**Files:**
- Modify: `src/shared/workflows.ts`
- Test: `tests/unit/pipeline-contract.test.ts`

**Steps:**
1. Add explicit wording that money-making image materials use background + inspiration atom + code-rendered logo/warning/art text overlay.
2. Assert the shared prompt contains layered composition and code-rendered text guidance.

### Task 2: Add Text Overlay Renderer

**Files:**
- Modify: `scripts/evaluate-real-model-image-quality.mjs`

**Steps:**
1. Import `ffmpeg-static` and `spawn`.
2. Add font discovery for macOS Chinese fonts.
3. Add drawtext escaping and filter construction helpers.
4. For each sample, save the model output as `<id>-base.png`, then render `<id>.png` with code text overlays.

### Task 3: Define Three Overlay Templates

**Files:**
- Modify: `scripts/evaluate-real-model-image-quality.mjs`

**Steps:**
1. `reward-atom`: add small logo label, warning/rule label, "做任务 集金币", "规则页查看".
2. `big-character-poster`: add large art text "积分任务" and "金币奖励", plus short icon card labels.
3. `ugc-reward-overlay`: add semi-transparent sticker copy "广告样张", "积分任务", "规则页".

### Task 4: Evaluate Final Composited Images

**Files:**
- Modify: `scripts/evaluate-real-model-image-quality.mjs`

**Steps:**
1. Update evaluation prompt to expect code-rendered text and reject missing required overlays.
2. Include base image path, final image path, and overlay text list in metadata/report.
3. Keep secret handling unchanged.

### Task 5: Verify

**Commands:**
- `node --check scripts/evaluate-real-model-image-quality.mjs`
- `npx vitest run tests/unit/pipeline-contract.test.ts`
- `REAL_IMAGE_ITERATION=15 npm run test:real:image-quality`
- `npm run typecheck`
- `npm run build`

**Expected:** Final images contain readable Chinese overlay text rendered by code. `npm run lint` and `npm test` may still be blocked by unrelated existing files; record if so.
