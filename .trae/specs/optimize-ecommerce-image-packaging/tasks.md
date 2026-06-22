# Tasks

- [x] Task 1: 更新产品规格与工作流契约
  - [x] SubTask 1.1: 在根目录 `spec.md` 中补充 `render_plan.json`、`finals.json` 质量元信息和中间素材入库契约
  - [x] SubTask 1.2: 在 `src/shared/workflows.ts` 中更新 `ecommerce_image.copy_render` Prompt，要求遵循渲染计划并输出更稳定的文字渲染
  - [x] SubTask 1.3: 保持 `WORKFLOW_DEFINITIONS.ecommerce_image` 五步节点不变，仅补充节点描述中的产物说明

- [x] Task 2: 优化电商图片 Pipeline 产物结构
  - [x] SubTask 2.1: 在 `src/main/pipelines/ecommerce-image/index.ts` 中新增 `RenderPlan` 类型与生成逻辑
  - [x] SubTask 2.2: 让 `copy_render` 在生成最终图前写入 `render_plan.json`
  - [x] SubTask 2.3: 扩展 `finals.json`，记录每张最终图的状态、源背景、文案、关键词和质量说明
  - [x] SubTask 2.4: 在单张最终图生成失败时，错误信息包含变体 index

- [x] Task 3: 增强文案兜底与规范化
  - [x] SubTask 3.1: 当 `copy_generate` 返回空关键词时，从商品名、品类或卖点生成最小 noun 关键词
  - [x] SubTask 3.2: 对 badges 做数量与长度规范化，避免过长文字进入图片渲染
  - [x] SubTask 3.3: 当用户提供 `fixedCopy` 时，确保它优先进入 headline 或 badges 的可审计字段

- [x] Task 4: 登记中间图片素材
  - [x] SubTask 4.1: `main_image_beautify` 成功后登记 `beautified.png` 为 `image` asset，tags 包含 `ecommerce_image`、`beautified`、style
  - [x] SubTask 4.2: `background_replace` 成功后登记每张 `background_variant_<i>.png` 为 `image` asset，tags 包含 `ecommerce_image`、`background`、style
  - [x] SubTask 4.3: 保持最终图现有 asset 登记，并补充 `final` tag

- [x] Task 5: 优化创建页面提示
  - [x] SubTask 5.1: 在 `src/renderer/pages/EcommerceImage.tsx` 增加模型调用次数提示：1 次主图美化 + N 次背景替换 + N 次文案渲染
  - [x] SubTask 5.2: 增加产物说明：主图美化、中间背景图、最终包装图均可在素材库定位
  - [x] SubTask 5.3: 保持现有表单字段不变，不新增必填项

- [x] Task 6: 补充测试并验证
  - [x] SubTask 6.1: 更新 `tests/unit/ecommerce-image-pipeline.test.ts`，断言 `render_plan.json`、扩展后的 `finals.json` 和中间图片 asset
  - [x] SubTask 6.2: 增加文案兜底测试：空 keywords 时仍生成 noun keyword
  - [x] SubTask 6.3: 更新契约测试，确认 step 名称不变
  - [x] SubTask 6.4: 运行 `npm run typecheck`
  - [x] SubTask 6.5: 运行 `npm run lint`
  - [x] SubTask 6.6: 运行 `npm test`
  - [x] SubTask 6.7: 运行 `npm run build`

- [x] Task 7: 修复本地原生依赖 ABI 后重新验证
  - [x] SubTask 7.1: 执行 `npm rebuild better-sqlite3`
  - [x] SubTask 7.2: 重新运行 `npm test` 并确认通过

# Task Dependencies
- Task 2 depends on Task 1
- Task 3 depends on Task 2
- Task 4 depends on Task 2
- Task 5 can run in parallel with Task 2 after Task 1 is complete
- Task 6 depends on Task 2, Task 3, Task 4, and Task 5
- Task 7 depends on Task 6
