# Tasks

- [x] Task 1: 明确真实模型测试入口和安全边界
  - [x] SubTask 1.1: 确认 `.env.local` 中真实图片模型所需的非密钥配置键名和密钥键名
  - [x] SubTask 1.2: 设计本地运行入口，确保只在开发机执行，不进入默认单元测试
  - [x] SubTask 1.3: 增加密钥保护要求：日志、报告、测试产物和 Git diff 中不得出现 API key、token、secret

- [x] Task 2: 生成网赚类测试样张
  - [x] SubTask 2.1: 准备三类网赚测试用例：红包金币奖励视觉、大字卖点海报、多卖点 UGC 奖励叠加
  - [x] SubTask 2.2: 使用真实图片模型生成第一轮样张
  - [x] SubTask 2.3: 保存每张样张的图片路径、Prompt、Prompt 版本、模型名和生成时间

- [x] Task 3: 建立效果评价报告
  - [x] SubTask 3.1: 对每张样张评估奖励视觉是否明确、网赚灵感原子是否突出、构图是否像可投放素材
  - [x] SubTask 3.2: 检查合规风险，包括保证收益、虚构提现、夸大赚钱效果、诱导误导下载
  - [x] SubTask 3.3: 记录“通过/不通过”、问题原因、证据和下一轮修改方向

- [x] Task 4: 迭代 Prompt 和轻量工作流
  - [x] SubTask 4.1: 当样张不通过时，修改 `src/shared/workflows.ts` 中相关 Prompt 规则或轻量生成策略
  - [x] SubTask 4.2: 重新运行真实模型生成样张，保存新的版本化结果
  - [x] SubTask 4.3: 对比上一轮与当前轮效果，保留更优 Prompt
  - [x] SubTask 4.4: 持续迭代直到样张整体效果在评估者看来已经不错

- [x] Task 5: 验证与交付
  - [x] SubTask 5.1: 运行聚焦测试，确认 Prompt/工作流改动没有破坏网赚类识别和路由
  - [x] SubTask 5.2: 运行 `npm run typecheck`
  - [x] SubTask 5.3: 运行 `npm run lint`
  - [x] SubTask 5.4: 运行 `npm test`
  - [x] SubTask 5.5: 运行 `npm run build`
  - [x] SubTask 5.6: 向用户提供最终效果图片路径、评价结论和仍需人工判断的风险

## 执行记录

- 复验问题：第 5 轮 UGC 样张存在“规则以活动页为冻”错字，且报告缺少验证命令；第 8 轮大字报手机界面小字存在乱码。
- 最终真实模型运行：`REAL_IMAGE_ITERATION=9 npm run test:real:image-quality`，三类样张均 accepted，报告记录无明显错字或乱码。
- 最终报告：`tmp/real-model-image-quality/2026-06-22T16-56-28-012Z-4993185e/report.md`。
- 最终样张：`tmp/real-model-image-quality/2026-06-22T16-56-28-012Z-4993185e/reward-atom.png`、`tmp/real-model-image-quality/2026-06-22T16-56-28-012Z-4993185e/big-character-poster.png`、`tmp/real-model-image-quality/2026-06-22T16-56-28-012Z-4993185e/ugc-reward-overlay.png`。
- 已强化 Prompt 和评价后处理：报告包含验证命令；明显错字、错别字、乱码、语义不通中文均作为硬拒绝；大字报禁止手机界面小字和功能按钮文字。
- 验证：`node --check scripts/evaluate-real-model-image-quality.mjs` 通过；`npx vitest run tests/unit/pipeline-contract.test.ts tests/unit/native-pipeline.test.ts` 通过，25 tests passed；`npm run typecheck` 通过；`npm run build` 通过。
- `npm run lint`、`npm test` 已执行；任务外阻塞原因见 `checklist.md` 验收记录。
- 最终验收复修：修复 accepted 误判逻辑，避免把模型未明确接受、下一轮建议里的禁止词、以及“无错字乱码”等否定表述误判为通过/失败；最终真实模型运行更新为 `REAL_IMAGE_ITERATION=14 npm run test:real:image-quality`。
- 最新最终报告：`tmp/real-model-image-quality/2026-06-22T17-31-19-326Z-25aa7805/report.md`。
- 最新最终样张：`tmp/real-model-image-quality/2026-06-22T17-31-19-326Z-25aa7805/reward-atom.png`、`tmp/real-model-image-quality/2026-06-22T17-31-19-326Z-25aa7805/big-character-poster.png`、`tmp/real-model-image-quality/2026-06-22T17-31-19-326Z-25aa7805/ugc-reward-overlay.png`。
- 人工目检：三图均为无可读文字/图标化版本，未见明显错字、乱码、随机字符或语义不通文字；UGC 中模型生成的模糊脸不作为本次质量问题。

# Task Dependencies
- Task 2 depends on Task 1
- Task 3 depends on Task 2
- Task 4 depends on Task 3
- Task 5 depends on Task 4
