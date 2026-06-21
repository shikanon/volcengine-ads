---
name: "model-client-integration"
description: "说明本仓库统一模型接入层、输入校验、限流、重试、轮询、错误分类与测试方式。修改 `src/main/model-client/**` 或接入新模型时调用。"
---

# Model Client Integration

## 能力说明

用于在本仓库里接入、修改或排查云端模型调用。所有图片、视频、数字人、LLM、联网搜索、TTS、ASR、视觉理解都必须经过 `src/main/model-client/**`。

## 何时调用

- 用户要新增模型服务商或新增 `ModelClient` 方法。
- 用户要改 Seedance、Seedream、LLM、TTS、ASR、web search 的调用方式。
- 用户要统一限流、重试、输入校验、错误分类。
- pipeline 报模型接口失败，但还没定位是输入问题、鉴权问题还是第三方失败。
- 用户要求补模型层单测或 mock 外呼。

不适合：

- 仅修改 pipeline 提示词组织，不改模型调用接口。
- 仅修改 FFmpeg、本地媒体处理。

## 输入信息

- 用户目标：接入新模型能力、修正模型调用、定位模型失败或补齐模型层测试。
- 问题范围：目标方法、目标服务商、报错类型、是否涉及轮询下载、是否涉及本地文件输入。
- 必读上下文：
  - `AGENTS.md` §7 外部 API 调用、§9 测试要求
  - `src/main/model-client/index.ts`
  - `src/main/model-client/volcengine.ts`
  - `src/main/errors.ts`
  - `src/main/secure/keystore.ts`
  - `src/shared/types.ts`
  - 相关测试：
    - `tests/unit/volcengine-input-validation.test.ts`
    - `tests/unit/volcengine-video.test.ts`
    - `tests/unit/volcengine-image.test.ts`
    - `tests/unit/volcengine-asr.test.ts`
    - `tests/unit/volcengine-vision.test.ts`
- 关键输入事实：
  - 主进程统一外呼入口为 `ModelClient`
  - 当前能力包括 `generateImage()`、`generateVideo()`、`generateDigitalHuman()`、`asr()`、`tts()`、`chat()`、`webSearch()`、`vision()`、`visionVideo()`
  - 当前实现为 `VolcengineModelClient`
  - 项目约束要求统一 `pLimit(2)` 和 `pRetry(3, factor: 2)`
  - 常见本地校验包括空输入、文件存在、扩展名、时长、比例、分辨率、speaker 合法性

## 执行步骤

1. 先确认目标能力是否应进入 `ModelClient`，不要在 pipeline 或 IPC handler 中直接 `fetch` 外网。
2. 若新增能力，先更新 `src/main/model-client/index.ts` 的接口定义，再在 `volcengine.ts` 或新的 `<vendor>.ts` 中实现。
3. 保留统一调用骨架：所有外呼都走 `MODEL_LIMIT(() => pRetry(async () => ...))`，并在请求前完成本地输入校验。
4. 若入参包含本地文件，优先做非空、文件存在、扩展名、文件大小，以及必要时的宽高、比例或时长检查。
5. 若接口是异步任务型，保留“创建任务 -> 轮询状态 -> 下载结果”的现有模式，并实现超时控制。
6. 若接口协议特殊，按真实协议处理，不要错误简化：
   - `webSearch()` 走 Ark `/responses` 和 `web_search`
   - `tts()` 解析逐行 JSON 音频块
   - `asr()` 先 submit 再 query
   - `generateVideo()` / `generateDigitalHuman()` 先创建任务再轮询下载
7. 错误分类时，明确区分 `E_INPUT_VALIDATION` 和 `E_MODEL_API_FAILED`，保留状态码、状态文本和必要的响应片段。
8. 新增服务商时，保持接口语义与 `ModelClient` 一致，不要让不同实现返回不同结构；若需要新凭据，先核对 `src/main/secure/keystore.ts`。
9. 修改后补对应单测，并确保所有外呼在单测中都通过 mock 完成。

## 输出结果

- 一份基于真实代码的模型接入说明，明确统一入口、能力范围、输入校验、限流重试、轮询下载和错误分类。
- 一套只放在 `src/main/model-client/**` 的实现或修改方案，不把模型调用泄漏到 pipeline、IPC 或 renderer 层。
- 明确的排障结论，例如“是本地输入不合法”“是第三方接口失败”“是轮询或下载阶段失败”。
- 配套的测试更新范围，说明应覆盖哪些 `volcengine-*.test.ts` 文件和哪些 mock 场景。

## 关键约束

- 不能在 pipeline 或 IPC handler 里直接 `fetch`。
- 不能移除 `pLimit(2)` 和 `pRetry(3, factor: 2)` 的项目约束。
- 不能把 `any` 塞进接口里规避类型设计。
- 不能跳过本地输入校验，直接把非法请求发到云端。
- 不能在测试里真实外呼网络，单测必须 mock。
- 不能绕过 `RuntimeCredentials` 直接硬编码 key 或 base URL。
- 视频理解必须走 `visionVideo(videoPath, prompt)`，不能用抽帧图片代替完整视频理解。

## 验证与交付

优先验证：

- `tests/unit/volcengine-input-validation.test.ts`
- `tests/unit/volcengine-video.test.ts`
- `tests/unit/volcengine-image.test.ts`
- `tests/unit/volcengine-asr.test.ts`
- `tests/unit/volcengine-vision.test.ts`

通用收尾：

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`

## 引用来源

- `AGENTS.md`
- `src/main/model-client/index.ts`
- `src/main/model-client/volcengine.ts`
- `src/main/errors.ts`
- `src/main/secure/keystore.ts`
- `src/shared/types.ts`
- `tests/unit/volcengine-input-validation.test.ts`
- `tests/unit/volcengine-video.test.ts`
- `tests/unit/volcengine-image.test.ts`
- `tests/unit/volcengine-asr.test.ts`
- `tests/unit/volcengine-vision.test.ts`

## 示例

- “如果用户要在 `native` pipeline 里直接调用网页搜索 API，应先扩展 `ModelClient`，再在 pipeline 里只调用 `ctx.modelClient.<method>()`。”
- “排查模型报错时，先检查文件是否存在、时长与分辨率是否合法、speaker 是否在支持列表里，再判断是否属于 HTTP 失败、轮询超时或下载失败。”
- “新增服务商时，新建 `src/main/model-client/<vendor>.ts` 实现 `ModelClient`，不要让 pipeline 根据服务商分支写调用逻辑。”
