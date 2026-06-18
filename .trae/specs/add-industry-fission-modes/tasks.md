# Tasks
- [x] Task 1: 定义组合式裂变共享契约：在共享类型和工作流定义中增加电商/短剧裂变行业、模式、槽位定义、组合估算工具和输入校验规则。
  - [x] SubTask 1.1: 扩展 `ExplosionInput`，增加可选 `fissionConfig`，保持默认裂变兼容。
  - [x] SubTask 1.2: 在 `src/shared/workflows.ts` 增加电商和短剧裂变模式定义与槽位文案。
  - [x] SubTask 1.3: 增加组合估算函数，支持空槽位校验与 `variantCount` 抽样边界。
- [x] Task 2: 更新爆款裂变页面：在 `Explosion.tsx` 增加行业裂变配置入口、模式选择、槽位素材选择、BGM 选择和组合估算展示。
  - [x] SubTask 2.1: 默认隐藏高级裂变配置，避免影响现有表单。
  - [x] SubTask 2.2: 电商模式按图 1 展示痛点前贴、利益点、实拍数字人和顺序混剪。
  - [x] SubTask 2.3: 短剧模式按图 2 展示顺势二创、前贴二创、解说二创和卡点混剪。
  - [x] SubTask 2.4: 提交任务时把用户选择的槽位素材和 BGM 写入 `fissionConfig`。
- [x] Task 3: 扩展 explosion pipeline：让脚本解析、改写、提示词优化和生成阶段理解组合式裂变槽位。
  - [x] SubTask 3.1: `script_parse` 输出可复用高光、可替换片段、利益点、剧情高光、节奏点等槽位候选。
  - [x] SubTask 3.2: `rewrite` 基于所选模式生成组合计划和缺失槽位的生成提示。
  - [x] SubTask 3.3: `video_prompt_optimize` 为需要云端生成的槽位生成 Seedance prompt，并保留用户上传素材路径。
  - [x] SubTask 3.4: `seedance` 按抽样组合准备槽位视频并输出最终变体路径。
- [x] Task 4: 实现 FFmpeg 组合拼接：在媒体层复用或补充拼接/BGM 函数，pipeline 只调用媒体 API。
  - [x] SubTask 4.1: 支持多视频槽位拼接，处理尺寸、比例和无音轨兜底。
  - [x] SubTask 4.2: 支持 BGM 混合或替换策略，保留必要口播音频。
  - [x] SubTask 4.3: 输出组合日志，记录输入槽位、BGM、最终文件和失败原因。
- [x] Task 5: 补充测试和验证。
  - [x] SubTask 5.1: 为组合估算、输入校验和默认兼容增加单测。
  - [x] SubTask 5.2: 为电商痛点前贴裂变和短剧前贴二创增加 pipeline 单测。
  - [x] SubTask 5.3: 为 FFmpeg 拼接和 BGM 处理增加或更新媒体单测。
  - [x] SubTask 5.4: 执行 `npm run typecheck && npm run lint && npm test && npm run build`。

# Task Dependencies
- Task 2 depends on Task 1.
- Task 3 depends on Task 1.
- Task 4 depends on Task 3.
- Task 5 depends on Tasks 1, 2, 3 and 4.
