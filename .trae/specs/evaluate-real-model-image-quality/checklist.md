- [x] `.env.local` 只在本地读取，日志、报告、测试产物和 Git diff 中没有密钥、token、secret
- [x] 真实模型测试入口不会进入默认 `npm test`，避免 CI 或普通单测产生真实模型费用
- [x] 至少生成三类网赚测试样张：红包金币奖励视觉、大字卖点海报、多卖点 UGC 奖励叠加
- [x] 每张样张都有可追踪记录：图片路径、Prompt、Prompt 版本、模型名、生成时间
- [x] 效果评价覆盖奖励视觉、网赚灵感原子、构图完成度、素材可投放感和合规风险
- [x] 效果不佳时已记录问题并迭代 Prompt 或轻量工作流
- [x] 最终被接受的样张有清晰图片路径和中文评价结论
- [x] 网赚类 Prompt 保留飞书文档素材规律：奖励视觉、大字报、UGC 叠加、真人信任套路
- [x] 网赚类 Prompt 明确规避保证收益、虚构提现、夸大赚钱效果和误导下载
- [x] 聚焦测试、`npm run typecheck`、`npm run lint`、`npm test`、`npm run build` 均通过或记录了明确的非本次变更阻塞原因

## 验收记录

- 复验修复：第 5 轮 UGC 错字和报告缺验证命令问题已处理；第 8 轮大字报手机界面乱码通过 v8 Prompt 收敛解决。
- 最终报告：`tmp/real-model-image-quality/2026-06-22T16-56-28-012Z-4993185e/report.md`
- 最终样张：
- `tmp/real-model-image-quality/2026-06-22T16-56-28-012Z-4993185e/reward-atom.png`
- `tmp/real-model-image-quality/2026-06-22T16-56-28-012Z-4993185e/big-character-poster.png`
- `tmp/real-model-image-quality/2026-06-22T16-56-28-012Z-4993185e/ugc-reward-overlay.png`
- 人工目检：UGC 标签为“广告样张 / 积分任务 / 规则页”，大字报为“积分任务 / 金币奖励”，未见明显错字或乱码。
- 真实模型命令：`REAL_IMAGE_ITERATION=9 npm run test:real:image-quality` 通过，三类样张均为 `accepted`。
- 脚本语法检查：`node --check scripts/evaluate-real-model-image-quality.mjs` 通过。
- 聚焦测试：`npx vitest run tests/unit/pipeline-contract.test.ts tests/unit/native-pipeline.test.ts` 通过，25 tests passed。
- `npm run typecheck` 通过。
- `npm run lint` 阻塞：任务外文件 `scripts/run-ecommerce-image.mjs` 存在未使用 `basename`，`src/main/model-client/local-mock.ts` 存在未使用 `opts`，`src/main/services/lark-download.ts` 存在 `import()` type annotation lint 规则错误。
- `npm test` 阻塞：任务外 `tests/unit/lark-download.test.ts` 两个用例失败，原因是 `src/main/services/lark-download.ts` 中 `BrowserWindow is not a constructor`。
- `npm run build` 通过。
