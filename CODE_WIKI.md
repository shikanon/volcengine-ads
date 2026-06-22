# Code Wiki — volcengine-ads（AIGC Ads Studio）

本项目是一个基于 **Electron + TypeScript + React + Zustand** 的本地私有化桌面应用，面向广告从业者提供一站式 AIGC 广告素材生产能力。重型 AI 推理通过云端 API（火山引擎 Seedance / Seedream / LLM / TTS / ASR、阿里 OSS 等）完成，本地负责素材管理、任务编排、FFmpeg 合成与桌面 UI。

---

## 1. 整体架构（三层结构）

```
┌────────────────────────────────────┐
│         Renderer（渲染层）          │
│  React 18 + Ant Design + Zustand   │
│  - 页面：工作台/爆款裂变/前贴/数字人/ │
│          原生/文案/打分/飞书下载/    │
│          工作流/素材库/设置          │
│  - 状态：tasks-store / assets-store /│
│          settings-store             │
│  - 通信：window.api（IPC 封装）       │
└────────────┬───────────────────────┘
             │ IPC（ipcRenderer.invoke/on）
             ▼
┌────────────────────────────────────┐
│          Preload（桥接层）           │
│  contextBridge 暴露 window.api       │
│  强类型：TaskProgressEvent/TaskRecord  │
└────────────┬───────────────────────┘
             │ IPC（ipcMain.handle/send）
             ▼
┌───────────────────────────────────────────────────────┐
│                  Main（主进程）                        │
│                                                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────┐ │
│  │   IPC    │  │  Queue   │  │ Pipeline │  │  DB   │ │
│  │  Handlers│  │  Worker  │  │  Runner  │  │ SQLite│ │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └───┬───┘ │
│       │             │              │              │     │
│       ▼             ▼              ▼              ▼     │
│  ┌─────────────────────────────────────────────────────┐ │
│  │                领域模块（Feature Modules）           │ │
│  │  explosion / pretrailer / avatar / native /         │ │
│  │  copywriting / video-scoring / lark-download        │ │
│  └────────────────────┬────────────────────────────────┘ │
│                       │                                  │
│                       ▼                                  │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ 外部接入（External Adapters）                        │ │
│  │ • model-client/volcengine.ts（Seedance/Seedream/   │ │
│  │   LLM/ASR/TTS + 并发 pLimit + 指数退避 pRetry）      │ │
│  │ • storage/aliyun-oss.ts（ASR 上传）                 │ │
│  │ • media/ffmpeg.ts（视频/音频合成）                   │ │
│  │ • secure/keystore.ts（密钥本地加密）                 │ │
│  └─────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

### 数据流

1. 用户在 Renderer 页面填写表单 → 通过 `window.api.task.create(request)` 发起
2. 主进程 `registerTaskIpc` 收到请求 → `TaskWorker.createTask` 做参数校验（`validation.ts`）
3. `SqliteTaskRepository.createTask` 写入 SQLite，并把任务登记到队列（`queue/worker.ts`）
4. `runPipeline` 按 pipeline 定义的步骤顺序执行：每个 step 可能调用 `ModelClient` 或 `ffmpeg`，每完成一步写一次 artifact 路径 + 推进进度事件 `event:task-progress`
5. Renderer 通过 `api.task.onProgress` 订阅事件，更新 `tasks-store`，驱动 UI 实时刷新

---

## 2. 目录结构

```
volcengine-ads/
├── package.json                # 依赖、scripts、electron-builder 打包配置
├── tsconfig.json / tsconfig.main.json   # TS 构建：renderer 使用 Vite，main 使用 tsc
├── vite.config.ts             # Renderer 开发/构建配置
├── spec.md                    # 产品规格、节点契约、Prompt 模板说明（single source of truth）
├── AGENTS.md                  # 给 AI Agent 的开发守则与任务模板
├── README.md                  # 用户使用说明
│
├── src/
│   ├── main/                  # 主进程（Node.js 环境）
│   │   ├── index.ts           # 应用启动入口：创建窗口、注册 IPC、初始化 worker
│   │   ├── errors.ts          # AppError + 错误码定义（E_INPUT_VALIDATION / E_MODEL_API_FAILED …）
│   │   ├── validation.ts      # 各任务类型输入校验器（文件存在、长度、枚举、路径）
│   │   ├── db/
│   │   │   ├── index.ts       # SqliteTaskRepository：任务/步骤/素材/设置 CRUD
│   │   │   ├── schema.ts      # DB 行类型（TaskRow / TaskStepRow / AssetRow …）
│   │   │   └── migrations/    # 初始建表脚本
│   │   ├── ipc/
│   │   │   ├── task.ts        # task:* IPC handler
│   │   │   ├── asset.ts       # asset:*（list/open/reveal/readText/pickFiles）
│   │   │   └── settings.ts    # settings:get / settings:set
│   │   ├── model-client/
│   │   │   ├── index.ts       # ModelClient 接口定义 + Request/Result 类型
│   │   │   └── volcengine.ts  # 火山引擎实现：Seedance/Seedream/LLM/ASR/TTS/visionVideo/webSearch
│   │   ├── pipelines/         # 每个子目录对应一类任务 pipeline
│   │   │   ├── index.ts       # 任务类型 → PipelineDefinition 注册表
│   │   │   ├── runner.ts      # runPipeline：步骤调度、进度推送、断点续跑、异常捕获
│   │   │   ├── types.ts       # StepContext / StepResult / PipelineStep / PipelineDefinition
│   │   │   ├── helpers.ts     # 通用工具：本地文件规范/artifact 写入等
│   │   │   ├── task-log.ts    # 结构化日志 appendPipelineLog
│   │   │   ├── codex-diagnosis.ts  # 失败时生成 Codex CLI 诊断文件
│   │   │   ├── explosion/     # 广告爆款裂变
│   │   │   ├── pretrailer/    # 广告前贴生成
│   │   │   ├── avatar/        # 数字人口播
│   │   │   ├── native/        # 六行业原生素材（game/short_drama/novel/social/tool/ecommerce）
│   │   │   ├── copywriting/   # 广告文案脚本
│   │   │   ├── video-scoring/ # 广告视频打分
│   │   │   └── lark-download/ # 飞书文档视频下载
│   │   ├── queue/
│   │   │   ├── worker.ts      # TaskWorker：并发队列 + 任务操作（retry/confirm/cancel/clone）
│   │   │   └── recover.ts     # 启动时把状态为 running 的任务置为 paused（防任务僵尸）
│   │   ├── secure/
│   │   │   └── keystore.ts    # SettingsService：密钥加密/解密（AES-256-GCM）+ 系统钥匙串
│   │   ├── media/
│   │   │   ├── ffmpeg.ts      # fluent-ffmpeg 封装：concat/trim/normalize/audio 合成
│   │   │   ├── bgm-analysis.ts# Meyda 音频特征（给视频打分节点使用）
│   │   │   └── douyin.ts      # 抖音链接解析
│   │   ├── services/
│   │   │   ├── lark-download-helpers.ts
│   │   │   └── lark-download.ts
│   │   └── storage/
│   │       └── aliyun-oss.ts  # OSS 文件上传（ASR 语音提交所需）
│   │
│   ├── preload/
│   │   ├── index.ts           # contextBridge 暴露 `window.api`
│   │   └── index.cts          # CommonJS 入口（由 preload 引用编译后的产物）
│   │
│   ├── renderer/
│   │   ├── main.tsx           # React 入口
│   │   ├── App.tsx            # Shell 布局 + 路由切换 + 进度订阅
│   │   ├── ipc.ts             # 类型化 IPC 调用封装
│   │   ├── styles.css
│   │   ├── stores/            # Zustand 状态管理
│   │   │   ├── tasks-store.ts    # 任务列表与进度合并
│   │   │   ├── assets-store.ts   # 素材库
│   │   │   └── settings-store.ts # 设置页状态
│   │   ├── components/
│   │   │   ├── TaskTable.tsx
│   │   │   └── SelectedAssetList.tsx
│   │   └── pages/             # 每类任务一个页面组件
│   │       ├── Home.tsx
│   │       ├── Explosion.tsx / Pretrailer.tsx / Avatar.tsx
│   │       ├── Native.tsx / Copywriting.tsx / VideoScoring.tsx
│   │       ├── LarkDownload.tsx / Workflows.tsx
│   │       ├── Assets.tsx / Settings.tsx
│   │
│   └── shared/                # 主/渲染共享类型与常量
│       ├── types.ts           # TaskType / TaskStatus / TaskRecord / *Input / *Result …
│       ├── ipc-channels.ts    # IPC channel 常量对象（task/event/asset/settings）
│       └── workflows.ts       # Fission 裂变工作流模板与 Prompt 覆盖
│
├── tests/
│   ├── unit/                  # vitest：覆盖 DB / Pipeline / Validation / ModelClient 输入处理
│   │   ├── *pipeline.test.ts
│   │   ├── validation.test.ts
│   │   ├── recover.test.ts
│   │   ├── douyin-path.test.ts / ffmpeg-path.test.ts
│   │   └── volcengine-*.test.ts
│   └── e2e/                   # Playwright + Electron
│
├── scripts/
│   ├── db-reset.mjs
│   ├── prepare-yt-dlp.cjs
│   └── pw_probe.mjs / pw_target_probe.mjs
│
├── resources/                 # 应用图标（icns/ico/png/svg）
└── release/                   # electron-builder 打包输出目录（运行时生成）
```

---

## 3. 关键模块职责

### 3.1 主进程入口：src/main/index.ts

- 创建 `BrowserWindow`，加载 Vite 开发 URL 或打包后的 HTML
- 初始化 `SqliteTaskRepository`、`SettingsService`、`VolcengineModelClientFactory`、`TaskWorker`
- 通过 `registerTaskIpc / registerAssetIpc / registerSettingsIpc` 注册所有 IPC 处理函数
- **启动恢复机制**：调用 `pauseRunningTasks(repository)` 把崩溃前残留的 running 任务置为 `paused`，避免任务永远跑不完

### 3.2 数据访问层：src/main/db

`SqliteTaskRepository` 是项目唯一的持久化入口。它负责：

- **任务表**：`tasks(id, type, status, progress, input_json, error, created_at, updated_at)`
- **步骤表**：`task_steps(id, task_id, step, status, artifact_path, logs, started_at, finished_at)`
- **素材表**：`assets(id, task_id, kind, path, thumbnail, duration, tags, created_at)`
- **设置表**：`settings(key, value)`
- **核心方法**：`createTask / cloneTask / listTasks / getTask / cancelTask / deleteTask / updateStep* / confirmWaitingStep / resetStepAndFollowing / pauseRunningTasks / setSetting / getSetting / listAssets / createAsset`

> 写操作串行：SQLite 本身就是单写多读；所有事务使用 `db.transaction(() => {...})()` 包裹。

### 3.3 任务队列与工作器：src/main/queue

- `TaskWorker`（`worker.ts`）基于 `p-queue` 控制本地并发，通过 `settings.concurrency` 调整
- 操作：`createTask / retryTask / retryStep / confirmScript / cancelTask / deleteTask / cloneTask`
- 每个任务在执行时会根据 `task.type` 从 `pipelines/index.ts` 取出 `PipelineDefinition`，再调用 `runner.ts` 的 `runPipeline` 依次执行
- **confirmScript**：当 pipeline 产出 `awaitingConfirmation` 时，任务停在 `waiting_confirmation`，用户通过该 IPC 把当前步骤标记为成功并让队列继续

### 3.4 Pipeline 运行器：src/main/pipelines/runner.ts

`runPipeline` 是整个项目的编排核心：

1. 根据 `task.type` 拿到 `PipelineDefinition.steps[]`
2. 对每个 step：
   - **断点续跑**：若该 step 已 success 且 artifact 仍然存在 → 跳过
   - 否则先更新 DB：`task_steps.status='running' / started_at`
   - 调用 `step.runStep(ctx)` 执行该 step 逻辑（通常调用 `ModelClient.*` 或 `ffmpeg.*`）
   - 更新 DB：`task_steps.status='success' / artifact_path / finished_at`
   - 触发 `TaskProgressEvent`（`emitProgress`），由主进程 `webContents.send` 回渲染层
3. step 抛错时：
   - 记录 pipeline.log
   - 运行 `runCodexDiagnosisOnce` 生成诊断文件
   - 把 `task.status` 置为 `paused` 并携带错误消息
4. 所有步骤完成后，更新 `task.status='success' / progress=100`

### 3.5 模型客户端：src/main/model-client

- `index.ts` 定义 `ModelClient` 接口（`generateImage / generateVideo / generateDigitalHuman / asr / tts / chat / webSearch / vision / visionVideo`）
- `volcengine.ts` 是实际实现，每个方法：
  - 做输入强校验（`requireNonEmpty / requireLocalFile / requireSupportedExt …`）
  - 使用 **`pLimit(2)`** 控制并发
  - 使用 **`pRetry`** 指数退避重试
  - 调用方式：`undici.fetch` 直接调用 HTTP API
  - 错误分类：`E_INPUT_VALIDATION`（参数错）/ `E_MODEL_API_FAILED`（云端错）
- **密钥**：由 `SettingsService.getRuntimeCredentials()` 返回，运行时注入，不写死在代码

### 3.6 媒体处理：src/main/media

- `ffmpeg.ts`：封装 `fluent-ffmpeg`，核心方法：
  - `normalizeVideo / trimVideo / extractAudio / transcodeAudioToMp3 / transcodeAudioToWav / trimAudio`
  - `concatAudioSegments / composeVideosWithBgm / concatVideos / concatSilentVideos`
  - `overlayProductImages`：把产品图合成到视频右下角
- `bgm-analysis.ts`：基于 `meyda` 做能量/频谱/动态特征摘要，作为打分 Prompt 的辅助信息
- `douyin.ts`：抖音链接解析与下载

### 3.7 存储与密钥：src/main/secure + src/main/storage

- `keystore.ts`：`SettingsService`
  - 读取 / 写入设置；敏感字段（API Key / Secret）使用 AES-256-GCM 加密
  - `KeytarSecretProvider`：优先读取系统钥匙串（macOS Keychain / Windows Credential Manager / Linux Secret Service）；失败时 fallback 到静态随机密钥
- `aliyun-oss.ts`：把本地音频上传到 OSS，用于火山 ASR 的公开 URL 提交

### 3.8 IPC 通道：src/shared/ipc-channels.ts

所有跨进程通信都走这里：

```typescript
export const IPC_CHANNELS = {
  task: {
    create: 'task:create',
    list: 'task:list',
    retry: 'task:retry',
    retryStep: 'task:retry-step',
    confirmScript: 'task:confirm-script',
    cancel: 'task:cancel',
    delete: 'task:delete',
    clone: 'task:clone',
  },
  asset: {
    list: 'asset:list',
    open: 'asset:open',
    reveal: 'asset:reveal',
    readText: 'asset:read-text',
    pickFiles: 'asset:pick-files',
  },
  settings: {
    get: 'settings:get',
    set: 'settings:set',
  },
  event: {
    taskProgress: 'event:task-progress',
  },
} as const;
```

> 新增 IPC 必须先在此文件新增常量，再在 `preload/index.ts` 暴露；主进程 `ipc/*.ts` 和渲染层 `stores/*` 同步接入。

### 3.9 类型与常量：src/shared/types.ts

- **任务类型**：`explosion | pretrailer | avatar | native | copywriting | video_scoring | lark_download`
- **任务状态**：`queued | running | success | failed | paused | canceled | waiting_confirmation`
- **步骤状态**：`pending | running | success | failed | skipped | canceled | waiting_confirmation`
- **素材类型**：`video | audio | image | script | report`
- **输入对象**：`ExplosionInput / PretrailerInput / AvatarInput / NativeInput / CopywritingInput / VideoScoringInput / LarkDownloadInput`
- **提供方设置**：`ProviderPublicSettings`（Seedance/Seedream/LLM/TTS/ASR/OSS 的 baseUrl、模型名称、音色等）
- **事件对象**：`TaskProgressEvent`（主→渲染进度推送）

### 3.10 渲染层：src/renderer

- **App.tsx**：Sider + Header + Content 三段布局；Sider 菜单切换页面；全局订阅 `api.task.onProgress`，回调交给 `useTasksStore.applyProgress` 合并本地状态
- **stores/tasks-store.ts**：维护 `TaskRecord[]`，通过 `applyProgress` 以事件增量更新 step/status/progress；`refreshOutputs=true` 时触发一次 `list` 拉最新产物
- **stores/settings-store.ts** & **stores/assets-store.ts**：维护设置页表单与素材库列表
- **pages/* **：每个页面收集该任务类型的输入表单，校验后 `api.task.create({ type, input })`
- **components/TaskTable.tsx**：通用任务列表，显示进度条、状态、步骤详情、重试/继续/取消/克隆/删除操作

---

## 4. 关键类与函数说明

### 4.1 TaskWorker（src/main/queue/worker.ts）

| 方法 | 说明 |
| --- | --- |
| `createTask(request)` | 校验参数 → 写入 DB → 入队执行 |
| `retryTask(taskId)` | 把 paused/failed 任务放回 queued，重新执行未完成步骤 |
| `retryStep({ taskId, stepId })` | 重置该 step 及之后所有步骤为 pending，再入队执行 |
| `confirmScript(taskId)` | 仅当 `status=waiting_confirmation` 有效：把当前等待节点标记成功，重新入队 |
| `cancelTask(taskId)` | 把状态置 `canceled`；队列侧通过每个 step 执行前后查询状态做协作取消 |
| `deleteTask(taskId)` | 任务必须不在 running 状态；删除任务记录及步骤（素材保留） |
| `cloneTask(taskId)` | 以相同 `type+input` 新建一条 `queued` 任务 |

### 4.2 runPipeline（src/main/pipelines/runner.ts）

```typescript
runPipeline(params: {
  task: TaskRecord;
  pipeline: PipelineDefinition;
  repository: TaskRepository;
  modelClient: ModelClient;
  workflowPrompts: WorkflowPromptOverrides;
  userDataPath: string;
  emitProgress: ProgressEmitter;
}): Promise<void>
```

- 顺序执行 `pipeline.steps`；对每个 step 先查断点、写 running、执行、写 success，推送进度事件
- 任何 step 抛 `AppError` 时记录到 `artifacts/<taskId>/pipeline.log`，任务暂停（`paused`）并在界面显示错误消息
- 支持 `awaitingConfirmation`：当 step 返回带此字段的 `StepResult` 时，任务进入人工确认等待态，由用户在 UI 点击「继续」触发 `confirmScript`

### 4.3 SqliteTaskRepository（src/main/db/index.ts）

- `createTask({request, stepNames})`：在 `tasks` 表插入一行，并按 stepNames 批量插入 `task_steps`（事务保证）
- `updateStepSuccess / updateStepRunning / updateStepFailed`：精细控制步骤状态
- `resetStepAndFollowing(taskId, stepId)`：用于「从某个节点重新执行」——把该 step 及下游步骤全部置为 pending，再把 task 回退到对应进度
- `pauseRunningTasks()`：启动恢复的一部分，把残留 running 任务置 paused

### 4.4 VolcengineModelClient（src/main/model-client/volcengine.ts）

| 方法 | 能力 |
| --- | --- |
| `generateImage(req)` | Seedream 文生图/图生图：参考图 + Prompt → PNG |
| `generateVideo(req)` | Seedance 视频生成：支持 9 张参考图、1 段参考视频、1 段参考音频 |
| `generateDigitalHuman(req)` | Seedance 数字人口播：avatar 图 + 音频驱动视频 |
| `asr(audioPath)` | 火山 ASR：上传到 OSS → 提交任务 → 轮询结果 → 返回 TranscriptResult |
| `tts(text, voice)` | 火山 TTS：多 chunk 合并为 mp3 临时文件 |
| `chat(messages, opts)` | LLM Chat：支持 `response_format`（JSON mode）与 `reasoningEffort` |
| `webSearch(req)` | 通过 Ark Responses 的 `web_search` tool 获取行业素材和热点；返回文本 + citations |
| `vision(images, prompt, opts)` | 视觉理解：把多张图片以 data URL 传给 LLM，按 Prompt 生成结构化结果 |
| `visionVideo(videoPath, prompt, opts)` | 完整视频理解：直接把视频文件以 data URL 提交，由云端模型返回打分/总结文本 |

> 所有方法都有：`pLimit(2)` 并发控制、`pRetry` 指数退避、参数存在性/扩展名/尺寸范围校验。

### 4.5 SettingsService（src/main/secure/keystore.ts）

- `getPublicSettings()`：返回带解密后的 API key 的界面配置（同时返回是否已配置的布尔提示）
- `updateSettings(update)`：写回 DB；敏感字段走 AES-256-GCM 加密；provider/Workflow Prompt 覆盖写归一化
- `getRuntimeCredentials()`：返回仅含运行时所需密钥的 `RuntimeCredentials`，供 `VolcengineModelClientFactory` 注入

---

## 5. Pipeline 契约与步骤清单

每个 `PipelineDefinition` 是一个固定顺序的 step 列表；每步实现签名：

```typescript
interface PipelineStep<TInput = PipelineInput> {
  name: string;
  canResume?(ctx: StepContext<TInput>, step: TaskStep): boolean | Promise<boolean>;
  runStep(ctx: StepContext<TInput>): Promise<StepResult>;
}

interface StepContext<TInput> {
  task: TaskRecord;
  input: TInput;
  artifactDir: string;                // userData/artifacts/<taskId>/
  logFilePath?: string;
  repository: TaskRepository;
  modelClient: ModelClient;
  workflowPrompts: WorkflowPromptOverrides;
  emitProgress(event: TaskProgressEvent): void;
  appendLog(level, message, data?): Promise<void>;
}
```

产物路径固定落在 `userDataPath/artifacts/<taskId>/<stepName>.<ext>`；UI 侧通过 `asset.reveal`（`shell.showItemInFolder`）调用系统文件管理器定位。

### 各任务类型 pipeline 步骤（与 spec.md 对齐）

| 任务类型 | 步骤（name） | 主要产物 | 调用模型 |
| --- | --- | --- | --- |
| **explosion**（广告爆款裂变） | `script_parse` / `concept_planner` / `script_writer` / `video_prompt_optimize` / `seedance` / `composer` | 裂变脚本文案 + 多段视频成片 | Seedance / LLM |
| **pretrailer**（广告前贴） | `script_gen` / `copy_gen` / `script_confirm` / `video_prompt_optimize` / `seedance` / `concat` | 前贴视频与原片拼接成片 | Seedance / LLM |
| **avatar**（数字人口播） | `tts` / `seedance_avatar` / `composer` | 驱动口播的音频与数字人视频合成 | Seedance + TTS |
| **native**（六行业原生素材） | `industry_router` / `concept_planner` / `script_writer` / `script_confirm` / `storyboard_builder` / `compliance_pre` / `video_prompt_optimize` / `asset_generator` / `consistency_checker` / `composer` | 多镜头脚本、分镜、合规预检、一致性检查与成片 | Seedance / LLM |
| **copywriting**（广告文案脚本） | `industry_router` / `template_optimize` / `web_research` / `requirement_decompose` / `strategy_analysis` / `script_writer` | 多条脚本 md 文本（script 素材） | LLM + webSearch |
| **video_scoring**（广告视频打分） | `ingest` / `score` / `report_writer` | 结构化评分与 report.md | LLM + visionVideo + meyda |
| **lark_download**（飞书视频下载） | `parse_url` / `discover` / `download` | 本地视频文件 | 纯飞书 OpenAPI + http |

---

## 6. 错误码与日志策略

在 `src/main/errors.ts` 定义 `AppError` 并集中使用：

- `E_INPUT_VALIDATION`：用户输入/参数错误
- `E_MODEL_API_FAILED`：云端模型调用失败（含 HTTP 5xx、API 错误）
- `E_TASK_STATE`：任务状态不合法的操作（如删除 running 任务、非 waiting 调用 confirmScript）
- `E_KEYSTORE_FAILED`：系统钥匙串读写失败

**日志位置**：
- `artifacts/<taskId>/pipeline.log`：结构化 JSON Lines，按 step 记录开始/成功/失败与 data 字段
- `electron-log`：主进程通用日志

---

## 7. 依赖关系（核心）

- **Electron**：桌面壳与 BrowserWindow / preload / ipcMain
- **better-sqlite3**：本地 SQLite 同步驱动
- **p-queue / p-limit / p-retry**：并发控制与重试
- **undici**：HTTP 客户端（替代 Node 内置 fetch）
- **fluent-ffmpeg + ffmpeg-static**：视频/音频合成
- **meyda**：音频特征提取（用于 video-scoring）
- **keytar**：系统钥匙串
- **React 18 + Ant Design + zustand**：前端 UI 与状态管理
- **vitest + @playwright/test**：单测 / E2E
- **typescript + eslint + prettier**：语言/代码风格治理
- **electron-builder**：macOS (dmg) / Windows (exe) / Linux (AppImage) 打包
- **vite**：renderer 热更新与构建

---

## 8. 项目运行方式

### 8.1 开发模式

```bash
# 1. 安装依赖（若 node_modules 还未生成）
npm ci

# 2. 开第一个终端：启动 Vite 渲染进程
npm run dev

# 3. 开第二个终端：启动 Electron 主进程（需等待 Vite 完成首次构建）
npm run dev:electron
```

- UI 改动会热更新；主进程/数据库/模型接口改动后，重新运行 `dev:electron`
- 首次启动后，在「设置」页面填写 Seedance/LLM/TTS/ASR/OSS 等服务配置，配置会加密写入本机 SQLite

### 8.2 打包（当前平台）

```bash
npm run build
# 产物位于 release/ 目录：
#   macOS arm64: release/mac-arm64/AIGC Ads Studio.app
#   Windows:      release/win-unpacked/
#   Linux:        release/linux-unpacked/
```

### 8.3 打包（全平台）

```bash
npm run build:all
```

### 8.4 代码质量与测试

```bash
# 类型检查
npm run typecheck

# Lint
npm run lint

# 单元测试
npm test

# 单测 watch 模式
npm run test:watch

# 单测覆盖率
npm run test:coverage

# 端到端测试（Playwright + Electron）
npm run test:e2e

# 真实接口冒烟（需先配置好服务密钥）
npm run test:live
npm run test:live:avatar    # 只测数字人
npm run test:live:asr       # 只测 ASR
```

### 8.5 常见问题

- **设置写在哪里**：`app.getPath('userData')/aigc.db`
- **任务产物在哪里**：`app.getPath('userData')/artifacts/<taskId>/`
- **开发模式和打包后的 userData 不同**：是正常行为，便于把开发数据和正式使用数据隔离
- **数据库重置**：`npm run db:reset`（慎用，会删本机配置和任务数据）

---

## 9. 开发约束与扩展点

### 9.1 新增 IPC 通道

1. 在 `src/shared/ipc-channels.ts` 增加常量（并更新 `IPC_CHANNELS`）
2. 在 `src/main/ipc/*.ts` 增加 handler 并使用 zod/手写校验（使用 `AppError('E_INPUT_VALIDATION', ...)` 抛错）
3. 在 `src/preload/index.ts` 的 `api` 对象增加方法
4. 在 `src/renderer/ipc.ts` 增加类型化封装（若有）
5. 在 `src/renderer/stores/*` 或页面里接入

### 9.2 新增任务类型（新 Pipeline）

1. 新建 `src/main/pipelines/<feature>/index.ts`，导出 `PipelineDefinition`
2. 在 `src/main/pipelines/index.ts` 注册到 `PIPELINES` 字典
3. 在 `src/shared/types.ts` 增加 `XxxInput` 类型和枚举位
4. 在 `src/main/validation.ts` 增加 `validateXxx(input)` 并挂到 `validateCreateTaskRequest`
5. 在 `src/renderer/pages/` 增加对应页面组件，更新 `App.tsx` 的菜单与路由映射
6. 写单测 `tests/unit/xxx-pipeline.test.ts` 并在 `tests/e2e/` 覆盖主流程

### 9.3 新增外部模型接入

- 在 `src/main/model-client/<vendor>.ts` 实现 `ModelClient` 子集方法
- 在 `src/main/ipc/settings.ts` / `secure/keystore.ts` 增加新的 `providerPublicSettings` 字段
- 在 `src/renderer/pages/Settings.tsx` 增加输入项
- 确保每个方法都加 `pLimit` / `pRetry`；使用项目内 `AppError` 抛出错误

---

## 10. 相关文件导航（快速定位）

| 能力 | 文件 |
| --- | --- |
| 应用启动、IPC 注册、队列初始化 | [src/main/index.ts](file:///Users/bytedance/Documents/volcengine-ads/src/main/index.ts) |
| 错误类型与错误码 | [src/main/errors.ts](file:///Users/bytedance/Documents/volcengine-ads/src/main/errors.ts) |
| 输入参数校验 | [src/main/validation.ts](file:///Users/bytedance/Documents/volcengine-ads/src/main/validation.ts) |
| SQLite 仓库 | [src/main/db/index.ts](file:///Users/bytedance/Documents/volcengine-ads/src/main/db/index.ts) |
| DB 行类型 | [src/main/db/schema.ts](file:///Users/bytedance/Documents/volcengine-ads/src/main/db/schema.ts) |
| 任务队列 worker | [src/main/queue/worker.ts](file:///Users/bytedance/Documents/volcengine-ads/src/main/queue/worker.ts) |
| 启动恢复 | [src/main/queue/recover.ts](file:///Users/bytedance/Documents/volcengine-ads/src/main/queue/recover.ts) |
| Pipeline runner | [src/main/pipelines/runner.ts](file:///Users/bytedance/Documents/volcengine-ads/src/main/pipelines/runner.ts) |
| Pipeline 注册表 | [src/main/pipelines/index.ts](file:///Users/bytedance/Documents/volcengine-ads/src/main/pipelines/index.ts) |
| Pipeline 类型 | [src/main/pipelines/types.ts](file:///Users/bytedance/Documents/volcengine-ads/src/main/pipelines/types.ts) |
| 模型客户端接口 | [src/main/model-client/index.ts](file:///Users/bytedance/Documents/volcengine-ads/src/main/model-client/index.ts) |
| 火山引擎实现 | [src/main/model-client/volcengine.ts](file:///Users/bytedance/Documents/volcengine-ads/src/main/model-client/volcengine.ts) |
| FFmpeg 封装 | [src/main/media/ffmpeg.ts](file:///Users/bytedance/Documents/volcengine-ads/src/main/media/ffmpeg.ts) |
| BGM 音频特征 | [src/main/media/bgm-analysis.ts](file:///Users/bytedance/Documents/volcengine-ads/src/main/media/bgm-analysis.ts) |
| 密钥与设置服务 | [src/main/secure/keystore.ts](file:///Users/bytedance/Documents/volcengine-ads/src/main/secure/keystore.ts) |
| 阿里云 OSS | [src/main/storage/aliyun-oss.ts](file:///Users/bytedance/Documents/volcengine-ads/src/main/storage/aliyun-oss.ts) |
| 任务 IPC handlers | [src/main/ipc/task.ts](file:///Users/bytedance/Documents/volcengine-ads/src/main/ipc/task.ts) |
| 素材 IPC handlers | [src/main/ipc/asset.ts](file:///Users/bytedance/Documents/volcengine-ads/src/main/ipc/asset.ts) |
| 设置 IPC handlers | [src/main/ipc/settings.ts](file:///Users/bytedance/Documents/volcengine-ads/src/main/ipc/settings.ts) |
| 主/渲染共享类型 | [src/shared/types.ts](file:///Users/bytedance/Documents/volcengine-ads/src/shared/types.ts) |
| IPC channel 常量 | [src/shared/ipc-channels.ts](file:///Users/bytedance/Documents/volcengine-ads/src/shared/ipc-channels.ts) |
| 工作流 Prompt 覆盖 | [src/shared/workflows.ts](file:///Users/bytedance/Documents/volcengine-ads/src/shared/workflows.ts) |
| preload 桥接层 | [src/preload/index.ts](file:///Users/bytedance/Documents/volcengine-ads/src/preload/index.ts) |
| Shell / 路由 / 订阅 | [src/renderer/App.tsx](file:///Users/bytedance/Documents/volcengine-ads/src/renderer/App.tsx) |
| 任务 store | [src/renderer/stores/tasks-store.ts](file:///Users/bytedance/Documents/volcengine-ads/src/renderer/stores/tasks-store.ts) |
| 产品规格文档 | [spec.md](file:///Users/bytedance/Documents/volcengine-ads/spec.md) |
| Agent 开发守则 | [AGENTS.md](file:///Users/bytedance/Documents/volcengine-ads/AGENTS.md) |
| 用户使用文档 | [README.md](file:///Users/bytedance/Documents/volcengine-ads/README.md) |
| NPM scripts / 依赖 | [package.json](file:///Users/bytedance/Documents/volcengine-ads/package.json) |
| Vite 构建配置 | [vite.config.ts](file:///Users/bytedance/Documents/volcengine-ads/vite.config.ts) |

> 本 Code Wiki 与 `spec.md` 保持一致；若两者存在冲突，以 `spec.md` 为准。
