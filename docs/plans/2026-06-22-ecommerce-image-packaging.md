# Ecommerce Image Packaging Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a new ecommerce image packaging workflow that turns a local product image into packaged ecommerce ad images with main-image beautification, copy generation/rendering guidance, and background replacement.

**Architecture:** Add `ecommerce_image` as a first-class task type using the existing Electron task queue and Pipeline runner. The pipeline reuses `ModelClient.vision`, `ModelClient.chat`, and `ModelClient.generateImage` so all heavy AI work stays behind the model-client layer, while local code handles validation, artifacts, task progress, UI forms, and asset registration.

**Tech Stack:** TypeScript, Electron IPC, React + Ant Design, Zustand, SQLite repository, existing Pipeline runner, Volcengine Seedream image generation, LLM chat/vision, Vitest.

---

### Task 1: Shared Contract And Spec

**Files:**
- Modify: `spec.md`
- Modify: `src/shared/types.ts`
- Modify: `src/shared/workflows.ts`

**Step 1: Extend `spec.md`**

Add a section for `ecommerce_image` with:
- Input contract: `productImagePath`, `productName?`, `sellingPoints?`, `fixedCopy?`, `scenePrompt?`, `variantCount`, `style`
- Pipeline steps: `product_understand`, `copy_generate`, `main_image_beautify`, `background_replace`, `copy_render`
- Output artifacts: `product.json`, `copy.json`, `beautified.png`, `backgrounds.json`, `finals.json`, `final_<i>.png`

**Step 2: Extend shared types**

Add:

```typescript
export type EcommerceImageStyle = 'clean' | 'premium' | 'promotion' | 'lifestyle';

export interface EcommerceImageInput {
  productImagePath: string;
  productName?: string;
  sellingPoints?: string;
  fixedCopy?: string;
  scenePrompt?: string;
  variantCount: number;
  style: EcommerceImageStyle;
}
```

Then include `ecommerce_image` in `TaskType`, `TaskRecord.input`, `CreateTaskRequest.input`, and `PipelineInput`.

**Step 3: Extend workflow metadata**

Add `WORKFLOW_PROMPT_DEFINITIONS` entries for:
- `ecommerce_image.product_understand`
- `ecommerce_image.copy_generate`
- `ecommerce_image.main_image_beautify`
- `ecommerce_image.background_replace`
- `ecommerce_image.copy_render`

Add `WORKFLOW_DEFINITIONS.ecommerce_image` nodes for UI workflow inspection.

**Step 4: Run focused type check**

Run:

```bash
npm run typecheck
```

Expected: Type errors remain until downstream task type consumers are updated.

---

### Task 2: Validation And Pipeline Registration

**Files:**
- Modify: `src/main/validation.ts`
- Modify: `src/main/pipelines/types.ts`
- Modify: `src/main/pipelines/index.ts`
- Create: `src/main/pipelines/ecommerce-image/index.ts`

**Step 1: Add input validation**

Implement `validateEcommerceImage(input)`:
- `productImagePath` required and must exist
- Allowed image extensions: `png`, `jpg`, `jpeg`, `webp`, `bmp`
- `productName <= 100`
- `sellingPoints <= 1000`
- `fixedCopy <= 120`
- `scenePrompt <= 500`
- `variantCount` integer `1..5`
- `style` must be one of `clean | premium | promotion | lifestyle`

**Step 2: Create pipeline skeleton**

Define:

```typescript
export const ecommerceImagePipeline: PipelineDefinition<EcommerceImageInput> = {
  type: 'ecommerce_image',
  steps: [
    { name: 'product_understand', runStep: runProductUnderstand },
    { name: 'copy_generate', runStep: runCopyGenerate },
    { name: 'main_image_beautify', runStep: runMainImageBeautify },
    { name: 'background_replace', runStep: runBackgroundReplace },
    { name: 'copy_render', runStep: runCopyRender },
  ],
};
```

**Step 3: Register pipeline**

Import the pipeline in `src/main/pipelines/index.ts` and add it to `PIPELINES`.

**Step 4: Add contract tests**

Update `tests/unit/pipeline-contract.test.ts` and `tests/unit/interface-test.test.ts` to assert pipeline existence and step order.

---

### Task 3: Pipeline Implementation

**Files:**
- Modify: `src/main/pipelines/ecommerce-image/index.ts`
- Test: `tests/unit/ecommerce-image-pipeline.test.ts`

**Step 1: Implement `product_understand`**

Use `ctx.modelClient.vision([productImagePath], prompt)` to return JSON:

```json
{
  "productName": "...",
  "category": "...",
  "visualFeatures": ["..."],
  "suspectedTextNoise": ["..."],
  "backgroundIssues": ["..."],
  "sellingPoints": ["..."]
}
```

Write `product.json`.

**Step 2: Implement `copy_generate`**

Use `ctx.modelClient.chat` to generate:

```json
{
  "headline": "...",
  "subHeadline": "...",
  "badges": ["..."],
  "keywords": [
    { "text": "...", "partOfSpeech": "noun|adjective|verb|other", "emphasis": "high|medium|low" }
  ],
  "styleHints": ["italic", "stroke", "background", "border"]
}
```

Write `copy.json` and `copy.md`.

**Step 3: Implement `main_image_beautify`**

Use `ctx.modelClient.generateImage` with original product image as reference and a prompt that removes non-product text, psoriasis-like decorations, non-essential logo/text clutter, and noisy underlays while preserving product shape, packaging, color, and ad-safe background.

Write `beautified.png`.

**Step 4: Implement `background_replace`**

For `variantCount`, use `ctx.modelClient.generateImage` with `beautified.png` as reference. Prompt Seedream to keep product unchanged while replacing/fusing the background according to style and `scenePrompt`.

Write `background_variant_<i>.png` and `backgrounds.json`.

**Step 5: Implement `copy_render`**

For each background variant, use `ctx.modelClient.generateImage` with `background_variant_<i>.png` as reference. Prompt Seedream to render headline/subheadline/badges with smart color, noun enlargement, outline/italic/border/background styles, and no garbled text.

Write `final_<i>.png`, `finals.json`, and create `image` assets tagged `ecommerce_image`, `style`.

**Step 6: Test pipeline**

Create a mock `ModelClient` that records `vision`, `chat`, and `generateImage` requests and writes fake output files.

Run:

```bash
npm test -- tests/unit/ecommerce-image-pipeline.test.ts
```

Expected: PASS.

---

### Task 4: Renderer UI

**Files:**
- Create: `src/renderer/pages/EcommerceImage.tsx`
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/pages/Home.tsx`
- Modify: `src/renderer/components/TaskTable.tsx`
- Modify: `src/renderer/pages/Workflows.tsx`

**Step 1: Add creation page**

Build a form with:
- Product image picker
- Product name
- Selling points
- Fixed copy
- Scene prompt
- Variant count
- Style radio/select

Submit:

```typescript
await createTask({
  type: 'ecommerce_image',
  input: {
    productImagePath,
    productName,
    sellingPoints,
    fixedCopy,
    scenePrompt,
    variantCount,
    style,
  },
});
```

**Step 2: Add navigation**

Add a new sidebar entry and home launcher titled `电商图片包装`.

**Step 3: Add task labels**

Update `TASK_TYPE_LABEL` and `STEP_LABELS` to show Chinese labels for the new pipeline.

**Step 4: Add workflow debugger option**

Add `ecommerce_image` to `WORKFLOW_OPTIONS`.

---

### Task 5: Validation Tests And Final Checks

**Files:**
- Modify: `tests/unit/validation.test.ts`
- Modify: `tests/e2e/workflows.spec.ts`

**Step 1: Add validation tests**

Add tests for:
- Valid ecommerce image input
- Missing product image
- Invalid style
- Variant count out of range

**Step 2: Add workflow E2E metadata assertion**

Assert `WORKFLOW_DEFINITIONS.ecommerce_image.nodes.map(node => node.id)` equals the five-step contract.

**Step 3: Run focused tests**

Run:

```bash
npm test -- tests/unit/validation.test.ts tests/unit/pipeline-contract.test.ts tests/unit/ecommerce-image-pipeline.test.ts
```

Expected: PASS.

**Step 4: Run project checks**

Run:

```bash
npm run typecheck
npm run lint
npm test
```

Expected: PASS. Run `npm run build` after tests if time permits because this is a functional UI + main-process change.

---

### Task 6: Commit

**Files:**
- Commit all modified source, tests, and spec files.

**Step 1: Review changes**

Run:

```bash
git diff --stat
git diff -- src shared tests spec.md
```

Expected: No secrets or user data.

**Step 2: Commit**

Run:

```bash
git add spec.md src tests docs/plans/2026-06-22-ecommerce-image-packaging.md
git commit -m "feat(ecommerce-image): add ecommerce image packaging workflow"
```
