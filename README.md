# AIGC Ads Studio

`volcengine-ads` 是一个本地私有化 Electron 桌面客户端，用于广告爆款裂变、广告前贴和数字人口播。重型 AI 推理通过云端 API 完成，本地负责素材管理、任务编排、配置保存、FFmpeg 处理和桌面 UI。

## 环境要求

- Node.js 20+
- npm
- macOS / Windows / Linux 桌面环境
- 可访问火山引擎、阿里云 OSS 等外部服务的网络

首次拉取项目后安装依赖：

```bash
npm ci
```

## 不打包启动测试

日常开发和功能测试不需要每次打包。开发模式需要开两个终端。

终端 1：启动 Vite 渲染服务。

```bash
npm run dev
```

终端 2：启动 Electron 客户端。

```bash
npm run dev:electron
```

开发模式下：

- UI 改动通常会热更新。
- 主进程、preload、数据库、模型接口相关代码改动后，重新运行 `npm run dev:electron`。
- 可以直接在设置页填写真实 API 配置，然后创建任务测试完整流程。

## 打包客户端

打包当前平台的目录版应用：

```bash
npm run build
```

构建完成后，产物输出到 `release/` 目录。macOS Apple Silicon 常见路径为：

```text
release/mac-arm64/AIGC Ads Studio.app
```

打包全平台：

```bash
npm run build:all
```

说明：

- `npm run build` 会先执行类型检查、编译主进程、构建渲染页面，再调用 `electron-builder --dir`。
- 当前配置默认输出目录版应用，便于本地测试。
- 若未配置正式图标或签名，electron-builder 可能提示默认 Electron 图标、macOS code signing skipped，这是本地测试包的正常提示。

## 配置说明

打开客户端后进入“设置”页面填写服务配置。配置保存到本机 SQLite 数据库，不需要写入源码或 `.env`。

常用配置项：

| 配置项 | 用途 |
| --- | --- |
| Seedance API Key | 视频生成接口鉴权 |
| Seedance Base URL | Seedance 接口地址 |
| Seedance 模型 ID | Seedance 使用的模型 |
| LLM API Key | 文案理解、脚本生成、改写等 LLM 调用 |
| LLM Base URL | LLM 接口地址 |
| LLM 模型 ID | LLM 使用的模型 |
| TTS AppId | 火山 TTS AppId |
| TTS Token | 火山 TTS Access Token |
| TTS Base URL | 火山 TTS 接口地址 |
| ASR API Key | 火山 ASR 新控制台鉴权，作为 `X-Api-Key` 使用 |
| ASR AppID | 火山 ASR 旧控制台鉴权，作为 `X-Api-App-Key` 使用 |
| ASR Access Token | 火山 ASR 旧控制台鉴权，作为 `X-Api-Access-Key` 使用 |
| ASR Base URL | 火山 ASR 接口地址 |
| ASR Resource ID | 火山 ASR 资源 ID，作为 `X-Api-Resource-Id` 使用 |
| OSS AccessKey ID | 阿里云 OSS 上传鉴权 |
| OSS AccessKey Secret | 阿里云 OSS 上传鉴权 |
| OSS Endpoint | 阿里云 OSS Endpoint |
| OSS Bucket | 阿里云 OSS Bucket 名称 |
| 并发任务数 | 本地任务队列并发数 |
| 默认前贴风格 | 广告前贴默认生成风格 |

ASR 配置里只保留接口实际使用的字段。`ASR 实例 ID / 名称` 不参与当前提交和查询接口调用，因此客户端不再提供该配置项。

## 配置和数据保存位置

应用数据保存在 Electron 的 `app.getPath('userData')` 目录下，数据库文件为：

```text
<userData>/aigc.db
```

任务产物保存在：

```text
<userData>/artifacts/<task_id>/
```

不同启动方式可能对应不同的 `userData` 目录：

- 开发模式：Electron 以项目开发应用身份运行，适合测试配置和任务。
- 打包后的应用：使用打包应用自己的 `userData` 目录。

因此，开发模式中保存的设置不一定会和打包后的 `.app` 共用。这有利于把开发测试数据和正式本地使用数据隔离。

## 测试命令

类型检查：

```bash
npm run typecheck
```

Lint：

```bash
npm run lint
```

单元测试：

```bash
npm test
```

E2E 测试：

```bash
npm run test:e2e
```

真实接口冒烟测试：

```bash
npm run test:live
```

只测试 ASR：

```bash
npm run test:live:asr
```

## 常见问题

### 可以不打包直接测试吗？

可以。使用 `npm run dev` + `npm run dev:electron` 即可打开 Electron 客户端并测试大部分功能。

### 为什么打包后的应用没有读取开发模式里的设置？

开发模式和打包应用可能使用不同的 `userData` 目录，数据库也就不同。请在对应应用的设置页重新保存配置。

### 设置保存后在哪里？

设置保存在本机 SQLite 数据库 `<userData>/aigc.db` 中，任务产物保存在 `<userData>/artifacts/` 中。

### 什么时候需要重新打包？

普通功能验证不需要重新打包。只有需要验证安装包、应用目录结构、随包资源、生产构建页面、Electron Builder 配置时，才需要执行 `npm run build`。
