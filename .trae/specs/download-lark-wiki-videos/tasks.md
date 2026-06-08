# Tasks
- [x] Task 1: 固化目标资源与基础证据。
  - [x] SubTask 1.1: 复核目标 `wiki` 节点、真实 `docx` token、视频附件清单和目标本地目录。
  - [x] SubTask 1.2: 保存当前插件链路失败证据，包括 `403`、流式错误和路径限制信息，避免重复尝试同一无效路径。

- [x] Task 2: 验证官方与半官方下载链路。
  - [x] SubTask 2.1: 继续测试 `docs +media-download`、`docs +media-preview`、`drive +download` 等链路，确认失败边界是否来自权限、输出路径或请求方式。
  - [x] SubTask 2.2: 搜索飞书文档附件下载、媒体预览、文件导出相关公开资料，提取可复用的接口线索、请求参数和鉴权方式。

- [x] Task 3: 使用浏览器登录态提取真实下载请求。
  - [x] SubTask 3.1: 在浏览器中打开目标文档，定位视频附件对应的预览、下载或播放入口。
  - [x] SubTask 3.2: 通过浏览器网络面板或自动化工具捕获相关请求，识别真实资源 URL、重定向链路、请求头和鉴权信息。
  - [x] SubTask 3.3: 判断是否能直接通过浏览器会话把文件保存到本地，或导出为可由脚本复现的请求。

- [x] Task 4: 编写最小脚本复现下载。
  - [x] SubTask 4.1: 基于已捕获的请求头、cookie、参数或签名方式，选择最小脚本方案复现文件下载。
  - [x] SubTask 4.2: 对下载结果做文件类型校验，排除拿到 HTML、JSON 报错页或空文件的假成功。
  - [x] SubTask 4.3: 如果第一次脚本方案失败，继续调整重定向、Range、Referer、Cookie 或其他请求要素，直到有一条成功链路。

- [x] Task 5: 批量落地并整理结果。
  - [x] SubTask 5.1: 至少成功下载 1 个视频文件到 `~/Downloads/lark-wiki-videos/` 下的目标子目录。
  - [x] SubTask 5.2: 若链路稳定，批量下载同文档内剩余视频文件，并保留原文件名或可映射命名。
  - [x] SubTask 5.3: 输出最终成功方案、下载目录、成功数量、失败数量和仍需人工协助的前提条件。

- [x] Task 6: 自验与回归确认。
  - [x] SubTask 6.1: 检查目标目录下文件存在且大小大于 0。
  - [x] SubTask 6.2: 抽样验证至少 1 个文件可被系统识别为视频文件。
  - [x] SubTask 6.3: 回看所有失败分支，确认没有遗漏更直接的下载路径。

# Task Dependencies
- `Task 2` depends on `Task 1`
- `Task 3` depends on `Task 1`
- `Task 4` depends on `Task 2` and `Task 3`
- `Task 5` depends on `Task 4`
- `Task 6` depends on `Task 5`

# Notes
- `Task 2` 与 `Task 3` 可并行推进。
- 若浏览器自动化无法直接读到 iframe 内部内容，应优先转向网络请求捕获而不是停留在页面点击。
- 若最终成功链路依赖当前浏览器登录态或 cookie，必须在结果中明确说明复用前提。
- 验收结果：`node --check scripts/download_wutg_video.mjs` 与 `node --check scripts/download_wutg_videos_batch.mjs` 已通过；`node scripts/download_wutg_video.mjs` 成功下载样本文件 `o0ZgrkWkA3QDZmNpNNMBAk9ubsE5ISezyXQeK4.mp4`；`node scripts/download_wutg_videos_batch.mjs` 发现 `34` 个视频块并实现 `34` 成功、`0` 失败，结果写入 `~/Downloads/lark-wiki-videos/WutgwjNvxienAqkVmwfc1sMZnqe/download-summary.json`。
- 当前目录内共有 `35` 个 `.mp4`：其中 `34` 个来自批量脚本 summary，额外 `1` 个是最小脚本单独下载的样本文件，因此目录计数与 summary 的差异仅由样本验证造成。
- 已回看失败分支：官方 `docs +media-download`、`docs +media-preview`、`drive +download` 分别被 `403` 或流式错误阻塞；浏览器页面内部 `box/file/info -> stream/download/video` 是更直接的真实下载链路；剩余批量失败项通过“按最高可用清晰度降级 + 有限重试”已全部消化，不再存在更直接且更稳定的路径。
- 人工前提条件：成功链路依赖当前浏览器已登录飞书的会话环境，由 Playwright 复用该页面会话中的 `session` / `_csrf_token` 等 cookie 发起内部请求；无需手工导出 cookie，但如果浏览器登录态失效，需要重新登录后再执行脚本。
