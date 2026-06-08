# Tasks
- [x] Task 1: 设计项目内飞书下载输入契约与任务类型。
  - [x] SubTask 1.1: 为飞书视频下载定义新的 `TaskType`、输入类型和结果描述，明确 `wiki/docx` 链接、输出目录策略和必要字段。
  - [x] SubTask 1.2: 扩展任务创建校验逻辑，拒绝空链接、非飞书链接和非法输入。

- [x] Task 2: 封装主进程飞书视频下载方法。
  - [x] SubTask 2.1: 将现有脚本中的页面打开、cookie 复用、`box/file/info` 请求封装为项目内方法。
  - [x] SubTask 2.2: 将视频流下载、清晰度降级、有限重试、文件名清洗和 `download-summary.json` 输出封装为可复用逻辑。
  - [x] SubTask 2.3: 返回结构化结果，包含成功项、失败项、目录路径和登录态失效提示。

- [x] Task 3: 将下载方法接入任务队列与 pipeline。
  - [x] SubTask 3.1: 新增飞书下载 pipeline，并定义最小步骤集合与 artifact 产物。
  - [x] SubTask 3.2: 在 `pipelines/index.ts`、`worker.ts`、共享类型和 IPC 创建链路中注册新任务类型。
  - [x] SubTask 3.3: 确保进度事件、任务状态和失败信息能在现有任务表中正确展示。

- [x] Task 4: 提供应用内入口。
  - [x] SubTask 4.1: 新增一个轻量页面，提供飞书链接输入与任务创建入口。
  - [x] SubTask 4.2: 将新页面接入现有导航与标题体系，复用最近任务展示。

- [x] Task 5: 补充验证与回归用例。
  - [x] SubTask 5.1: 为输入校验和下载服务添加最小单测，重点覆盖非法链接、清晰度降级和结果汇总。
  - [x] SubTask 5.2: 为 pipeline 或任务创建链路补最小测试，确保新任务类型可被创建和执行。
  - [x] SubTask 5.3: 执行 `npm run typecheck`、`npm run lint`、`npm test`，并在适用时执行 `npm run build`。
  - 注：`typecheck` 与 `build` 通过；`lint` 因 `scripts/pw_probe.mjs`、`scripts/pw_target_probe.mjs`、`scripts/pw_wutg_probe.mjs` 的既有 `no-empty` 报错失败；`test` 因既有 `better-sqlite3` Node ABI 不匹配导致 `copywriting-pipeline`、`task-actions`、`pipeline-logging` 失败。

# Task Dependencies
- `Task 2` depends on `Task 1`
- `Task 3` depends on `Task 1` and `Task 2`
- `Task 4` depends on `Task 1` and `Task 3`
- `Task 5` depends on `Task 2` and `Task 3`

# Notes
- 优先做“任务化集成 + 最小页面入口”，避免一开始扩展成完整素材管理模块。
- 浏览器会话复用是已验证成功的关键路径，规格实现中必须显式保留登录态失效提示。
- 若下载目录最终采用项目 `userData/artifacts/<task_id>/`，需要在实现时明确是否还支持用户自定义输出路径，并保持输入契约一致。
