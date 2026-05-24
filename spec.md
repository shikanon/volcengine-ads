# AIGC 广告素材生成工具 — 实现规格（spec.md）

---

## 0. 项目元信息

| 项 | 值 |
|---|---|
| 项目代号 | `volcengine-ads` |
| 形态 | Electron 桌面应用（私有化、单机、个人独占） |
| 端 | Windows 10/11、macOS 12+（Apple Silicon / Intel）、Linux（Ubuntu 22.04） |
| 登录 / 多租户 | **无**（不实现登录、注册、权限、计费） |
| 联网 | 必须（调用 Seedance2.0 / LLM / TTS / ASR 等云端 API） |
| 本地推理 | **无**（不部署本地 GPU 模型） |
| 持久化 | SQLite（嵌入式）+ 本地文件系统 |

---

## 1. 技术栈与版本（硬约束）

| 层 | 选型 | 锁定版本/库 |
|---|---|---|
| 桌面壳 | Electron | `electron@^30`、`electron-builder@^24` |
| 渲染层 | React + TS + Vite | `react@^18`、`typescript@^5`、`vite@^5` |
| UI 组件 | `antd@^5` 或 `shadcn-ui` | 二选一，全项目一致 |
| 状态管理 | `zustand@^4` | — |
| 主进程 | Node.js | Node 20 LTS |
| 数据库 | `better-sqlite3@^11` | 同步驱动 |
| ORM（可选） | `drizzle-orm@^0.33` | 或原生 SQL |
| 任务队列 | `p-queue@^8` + SQLite 状态表 | 不引入 Redis / MQ |
| HTTP 客户端 | `undici@^6`（或内置 `fetch`） | + `form-data` 多模态上传 |
| 重试 / 限流 | `p-retry@^6` + `p-limit@^6` + `bottleneck@^2` | — |
| 视频处理 | `ffmpeg-static` + `fluent-ffmpeg@^2` | 跨平台一致 |
| 抖音下载 | `yt-dlp`（随包二进制）+ `execa@^9` | — |
| 日志 | `electron-log@^5` | 默认仅本地落盘 |
| 自动更新 | `electron-updater@^6`（可选） | 可关闭 |
| 测试 | `vitest@^2` + `playwright@^1`（E2E） | — |

> ⛔ 禁止：引入 Python sidecar、本地 HTTP server、Docker、Redis、消息队列。

---

## 2. 仓库目录结构（按此创建）

```
volcengine-ads/
├── package.json
├── electron-builder.yml
├── vite.config.ts
├── tsconfig.json
├── src/
│   ├── main/                        # 主进程
│   │   ├── index.ts                 # Electron 入口
│   │   ├── ipc/                     # ipcMain handlers（按功能分文件）
│   │   │   ├── task.ts
│   │   │   ├── asset.ts
│   │   │   └── settings.ts
│   │   ├── db/                      # SQLite
│   │   │   ├── index.ts             # 连接 + migrate
│   │   │   ├── schema.ts            # 表结构定义
│   │   │   └── migrations/
│   │   ├── model-client/            # 云端模型统一适配层
│   │   │   ├── index.ts             # ModelClient 接口
│   │   │   ├── seedance.ts          # Seedance2.0
│   │   │   ├── llm.ts
│   │   │   ├── tts.ts
│   │   │   └── asr.ts
│   │   ├── pipelines/               # 三大功能编排
│   │   │   ├── explosion/           # 功能一：爆款裂变
│   │   │   ├── pretrailer/          # 功能二：广告前贴
│   │   │   └── avatar/              # 功能三：数字人口播
│   │   ├── queue/                   # 任务队列 + 断点续跑
│   │   │   ├── worker.ts
│   │   │   └── recover.ts
│   │   ├── media/                   # FFmpeg / 下载封装
│   │   │   ├── ffmpeg.ts
│   │   │   └── douyin.ts
│   │   └── secure/                  # API Key 加密存储
│   │       └── keystore.ts
│   ├── preload/
│   │   └── index.ts                 # contextBridge 暴露安全 API
│   ├── renderer/                    # React UI
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── pages/
│   │   │   ├── Home.tsx             # 工作台 / 任务列表
│   │   │   ├── Explosion.tsx
│   │   │   ├── Pretrailer.tsx
│   │   │   ├── Avatar.tsx
│   │   │   ├── Assets.tsx
│   │   │   └── Settings.tsx
│   │   ├── components/
│   │   ├── stores/                  # zustand
│   │   └── ipc.ts                   # 包装 window.api
│   └── shared/                      # 主/渲染共享类型
│       ├── types.ts
│       └── ipc-channels.ts
└── tests/
    ├── unit/
    └── e2e/
```

---

## 3. 进程模型与安全边界

- **渲染进程**：只渲染 UI；通过 `preload + contextBridge` 暴露的 `window.api.*` 调 IPC，**不直接访问** 文件系统 / SQLite / 公网 API。
- **主进程**：唯一持有 SQLite 句柄、文件 I/O、子进程、外网 HTTPS 调用；负责任务编排。
- **IPC 通道命名**：`channel = '<domain>:<action>'`，统一定义于 `src/shared/ipc-channels.ts`，例：`task:create`、`task:list`、`task:retry-step`、`asset:list`、`settings:get`、`settings:set`、`event:task-progress`（主→渲染）。

---

## 4. 数据模型（SQLite）

> 使用 `better-sqlite3`；启动时自动 migrate；数据库文件位于 `app.getPath('userData')/aigc.db`。

### 4.1 表结构（DDL 必须等价）

```sql
CREATE TABLE IF NOT EXISTS tasks (
  id           TEXT PRIMARY KEY,             -- uuid v4
  type         TEXT NOT NULL,                -- 'explosion' | 'pretrailer' | 'avatar'
  status       TEXT NOT NULL,                -- 'queued'|'running'|'success'|'failed'|'paused'
  progress     INTEGER NOT NULL DEFAULT 0,   -- 0..100
  input_json   TEXT NOT NULL,                -- 输入参数序列化
  error        TEXT,                         -- 失败原因
  created_at   INTEGER NOT NULL,             -- ms epoch
  updated_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS task_steps (
  id            TEXT PRIMARY KEY,
  task_id       TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  step          TEXT NOT NULL,               -- 'download'|'asr'|'frames'|'rewrite'|'seedance'|'concat' ...
  status        TEXT NOT NULL,               -- 'pending'|'running'|'success'|'failed'|'skipped'
  artifact_path TEXT,                        -- 产物本地路径
  logs          TEXT,
  started_at    INTEGER,
  finished_at   INTEGER
);

CREATE TABLE IF NOT EXISTS assets (
  id         TEXT PRIMARY KEY,
  task_id    TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  kind       TEXT NOT NULL,                  -- 'video'|'audio'|'image'|'script'|'report'
  path       TEXT NOT NULL,
  thumbnail  TEXT,
  duration   REAL,
  tags       TEXT,                           -- JSON array
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS avatars (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  image_path TEXT NOT NULL,
  source     TEXT NOT NULL                   -- 'builtin'|'user'
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL                        -- JSON
);

CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_steps_task ON task_steps(task_id, step);
```

### 4.2 关键约束

- SQLite 仅在主进程访问；写操作串行化（`better-sqlite3` 同步即可）。
- 任务状态机：`queued → running →(success | failed | paused)`；`failed/paused` 可 `retry` 回到 `running`。
- 步骤产物路径在 `app.getPath('userData')/artifacts/<task_id>/<step>.<ext>`。

---

## 5. 共享类型（`src/shared/types.ts`）

```ts
export type TaskType = 'explosion' | 'pretrailer' | 'avatar';
export type TaskStatus = 'queued' | 'running' | 'success' | 'failed' | 'paused';
export type StepStatus = 'pending' | 'running' | 'success' | 'failed' | 'skipped';

export interface TaskRecord {
  id: string;
  type: TaskType;
  status: TaskStatus;
  progress: number;          // 0..100
  input: ExplosionInput | PretrailerInput | AvatarInput;
  error?: string;
  createdAt: number;
  updatedAt: number;
  steps: TaskStep[];
}

export interface TaskStep {
  id: string;
  step: string;
  status: StepStatus;
  artifactPath?: string;
  logs?: string;
  startedAt?: number;
  finishedAt?: number;
}

// ── 功能一：爆款裂变
export interface ExplosionInput {
  douyinUrl: string;         // 必填：链接 / 短链 / 分享口令
  variantCount: number;      // 1..10，默认 3
}

// ── 功能二：广告前贴
export type PretrailerStyle = 'auto' | 'suspense' | 'contrast' | 'pain' | 'benefit';
export interface PretrailerInput {
  sourceVideoPath: string;   // 本地 MP4/MOV
  pretrailerDuration: number;// 5..10，默认 7
  style: PretrailerStyle;
}

// ── 功能三：数字人口播
export interface AvatarInput {
  avatarImagePath: string;          // 内置或用户上传
  brandIntro: string;               // 100..500 字
  productImagePaths: string[];      // 1..3 张
  duration: number;                 // 15..60，默认 30
}
```

---

## 6. ModelClient 适配层（主进程）

### 6.1 接口契约（`src/main/model-client/index.ts`）

```ts
export interface ModelClient {
  // Seedance2.0 视频生成（视频 + 图片 + 文本 / 图片 + 文本）
  generateVideo(req: SeedanceVideoRequest): Promise<VideoResult>;
  // Seedance2.0 数字人（音频 + 图片）
  generateDigitalHuman(req: SeedanceAvatarRequest): Promise<VideoResult>;
  asr(audioPath: string): Promise<TranscriptResult>;
  tts(text: string, voice: string): Promise<AudioResult>;
  chat(messages: ChatMessage[], opts?: ChatOptions): Promise<string>;
  // 多模态理解（产品图、视频内容）
  vision(images: string[], prompt: string): Promise<string>;
}

export interface SeedanceVideoRequest {
  refVideoPath?: string;     // 风格参考视频（爆款裂变用）
  refImagePaths?: string[];  // 关键帧 / 产品图
  prompt: string;            // 重写文案 + 分镜脚本
  durationSec?: number;
  resolution?: string;       // e.g. '1080x1920'
}

export interface SeedanceAvatarRequest {
  audioPath: string;
  avatarImagePath: string;
  durationSec?: number;
}

export interface VideoResult { localPath: string; duration: number; }
export interface AudioResult { localPath: string; duration: number; }
export interface TranscriptResult { text: string; segments: { start: number; end: number; text: string }[]; }
export interface ChatMessage { role: 'system'|'user'|'assistant'; content: string; }
export interface ChatOptions { temperature?: number; jsonSchema?: object; }
```

### 6.2 实现规则

- 所有外呼统一经 `pLimit(2)`（同一服务最多 2 路并发）+ `pRetry({ retries: 3, factor: 2 })`（指数退避）。
- 大文件上传走预签名 URL 或 `form-data`；下载结果落盘至 `artifacts/<task_id>/`。
- API Key 通过 `secure/keystore.ts` 解密获得，**绝不**打日志、**绝不**经 IPC 暴露到渲染层。
- 超时：单次请求默认 120s；视频生成轮询用长轮询/任务态 polling，整体步骤上限按 §10 性能指标。

---

## 7. 任务队列与编排

### 7.1 入队

- `task:create` IPC：参数 `{ type, input }`；
  1) 校验输入；
  2) 写 `tasks`（`status='queued'`）；
  3) 计算并预写 `task_steps`（按 pipeline 定义）；
  4) `p-queue` 提交 worker；
  5) 返回 `task.id`。

### 7.2 执行

- `concurrency = 1`（默认顺序执行，避免抢占带宽 / 显存）；可在 `settings` 设为 1..2。
- 每步执行：`status=running` → 跑 → 落盘 artifact → `status=success`；失败置 `failed` 并整任务停。
- 进度上报：每步开始 / 结束都通过 `event:task-progress` 推送渲染层（节流 200ms）。

### 7.3 断点续跑（崩溃恢复）

- 启动时 `queue/recover.ts`：
  - 把 `tasks.status='running'` 全部置为 `paused`；
  - 对 `paused` 任务支持 UI 一键 `retry`，从首个非 `success` 步骤继续；
  - 已 `success` 的步骤跳过（基于 `task_steps.artifact_path` 存在校验）。

### 7.4 重试策略

- **步骤级重试**：`task:retry-step { taskId, stepId }`。
- **API 调用级**：在 `ModelClient` 内 `p-retry`；3 次仍失败抛 `RetryableError`，由步骤层捕获并置 `failed`。

---

## 8. 三大功能 Pipeline 详细规约

> 每个 pipeline 必须严格按下述 step 顺序与命名实现；步骤名即 `task_steps.step` 字段。

### 8.1 功能一：爆款裂变（`pipelines/explosion`）

**步骤序列**（按顺序）：

| step | 输入 | 输出 artifact | 实现要点 |
|---|---|---|---|
| `download` | `douyinUrl` | `source.mp4`、`source.m4a`、`meta.json` | `yt-dlp` 拉取无水印视频；提取音轨；记录原时长 |
| `frames` | `source.mp4` | `frames/*.jpg`（每秒 1 帧）、`keyframes/*.jpg`（场景切换点） | `ffmpeg`：`-vf "fps=1"` + 场景检测 `select='gt(scene,0.4)'` |
| `asr` | `source.m4a` | `transcript.json`（TranscriptResult） | `ModelClient.asr` |
| `script_parse` | `frames` + `keyframes` | `script_parse.json`（分镜数、节奏、转场、卖点） | `ModelClient.vision` + `chat` |
| `rewrite` | `transcript` + `script_parse` + `variantCount` | `variants.json`（N 条：每条含新文案 + 新分镜脚本） | `chat`：保留"钩子-卖点-CTA"结构，禁止丢失关键 CTA |
| `seedance` | 对每个 variant 调用 | `variant_<i>.mp4`（无音轨） | `generateVideo({ refVideoPath: source.mp4, refImagePaths: keyframes, prompt: variant.script })` |
| `audio_replace` | `variant_<i>.mp4` + `source.m4a` | `final_<i>.mp4` | FFmpeg：以原音频时长为准对新视频做加速/补帧/截断后混音 |

**业务规则（必须实现）**：

1. 新视频时长与原音频不一致 → 以原音频时长为基准做加速/补帧/截断。
2. 检测到 BGM 版权风险提示 → 写入 `meta.json.warnings`，**不阻断**。
3. `rewrite` 输出必须保留 `script_parse.cta_keywords` 中的关键词，缺失视为失败。
4. `variantCount` 上限 10；超过抛 `ValidationError`。

**最终输出**：N 条 `final_<i>.mp4`、1 份 `script_parse.json`（拆解报告）、1 份 `variants.md`（新文案 + 分镜）。

### 8.2 功能二：广告前贴（`pipelines/pretrailer`）

**步骤序列**：

| step | 输入 | 输出 | 实现要点 |
|---|---|---|---|
| `ingest` | `sourceVideoPath` | `source.mp4`、`source.m4a` | 复制并统一编码（H.264 / AAC / 30fps） |
| `understand` | `source.mp4` 关键帧 | `understanding.json`（产品类目、卖点、画面风格、人群） | `vision + chat`，含 `confidence` 字段 |
| `keyframe_pick` | `source.mp4` | `keyframes/*.jpg`（2-4 张） | 场景切换 + 显著产品镜头 |
| `copy_gen` | `understanding`、`style`、`pretrailerDuration` | `copy.json`（前贴文案） | 1 秒内出现核心钩子；按 `style` 切换风格 |
| `script_gen` | `copy` | `script.json`（2-4 个镜头 × 图片+文本 prompt） | 与 Seedance2.0 输入对齐 |
| `seedance` | `script` + `keyframes` | `pretrailer.mp4`（无音） | `generateVideo({ refImagePaths: keyframes, prompt: script })` |
| `tts` | `copy.text` | `pretrailer.m4a` | `ModelClient.tts`，音色按品类/风格 |
| `mux_pretrailer` | `pretrailer.mp4` + `pretrailer.m4a` | `pretrailer_av.mp4` | FFmpeg 音视频合流 |
| `concat` | `pretrailer_av.mp4` + `source.mp4` | `final.mp4` | FFmpeg：统一分辨率/帧率/码率；拼接处加 **0.3-0.5s 淡入** 过渡 |

**业务规则**：

1. 风格与原片"协调而非雷同"——`copy_gen` 的 prompt 需注入原片风格摘要并要求**差异化呈现**。
2. 钩子位置 ≤ 1 秒（视觉/文字/声音任一）；在 `script_gen` 校验首镜头时长 ≤ 1s。
3. 拼接必须 `xfade transition=fade:duration=0.3..0.5`。
4. `understanding.confidence < 0.6` → 步骤失败并提示"内容理解置信度不足，请重试或更换素材"。

### 8.3 功能三：数字人口播（`pipelines/avatar`）

**步骤序列**：

| step | 输入 | 输出 | 实现要点 |
|---|---|---|---|
| `validate_avatar` | `avatarImagePath` | `validate.json` | 校验：正面、清晰、单人；不合格抛错 `AvatarInvalid` |
| `product_understand` | `productImagePaths` | `product.json`（形态/颜色/卖点） | `vision + chat` |
| `brand_parse` | `brandIntro` | `brand.json`（调性、人群、差异化点） | `chat` |
| `script_gen` | `brand` + `product` + `duration` | `script.json` | 结构：开场钩子 / 产品卖点 / CTA；**至少 2 个差异化卖点**；标注每个卖点的时间锚点 |
| `tts` | `script` | `voice.m4a` | 按 `brand.tone` 选音色 |
| `seedance_avatar` | `voice.m4a` + `avatarImagePath` | `avatar.mp4` | `generateDigitalHuman({ audioPath, avatarImagePath })` |
| `overlay` | `avatar.mp4` + `productImagePaths` + `script.timeline` | `final.mp4` | FFmpeg 画中画 / 全屏切入；时间点在卖点 ±1s 内 |
| `postprocess` | `final.mp4` | `final.mp4`（覆盖） | 统一码率、嵌入字幕（可选） |

**业务规则**：

1. `script_gen` 必须至少 2 个产品差异化卖点；不足视为失败。
2. 产品图叠加在对应卖点 **±1 秒** 内；时间点来自 `script.timeline`。
3. 数字人唇形同步误差目标 ≤ 80ms（实现层通过 Seedance 返回元数据校验，超阈值告警不阻断）。
4. `validate_avatar` 失败时 UI 直接返回提示，允许用户重选。

---

## 9. 渲染层（UI）

### 9.1 路由

| 路径 | 页面 | 关键交互 |
|---|---|---|
| `/` | Home / 工作台 | 三大功能卡片入口 + 最近任务列表（执行中 / 已完成 / 失败）；一键重试 / 查看产物 |
| `/explosion` | 爆款裂变 | 表单：链接 + 裂变数量；提交 → 进度条（按 step）→ 产物预览 |
| `/pretrailer` | 广告前贴 | 表单：本地视频 + 时长 + 风格；同上 |
| `/avatar` | 数字人口播 | 数字人选择（内置/上传）+ 品牌介绍 + 产品图（1-3）+ 时长 |
| `/assets` | 素材库 | 按功能/时间筛选；视频在线播放；本地文件夹定位；一键下载/分享 |
| `/settings` | 设置 | 各模型服务的 API Key、并发数、默认风格 |

### 9.2 状态管理

- `zustand` 分 store：`tasksStore`、`assetsStore`、`settingsStore`。
- 主进程通过 `webContents.send('event:task-progress', payload)` 推送，渲染层订阅更新 `tasksStore`。

### 9.3 安全

- `nodeIntegration: false`、`contextIsolation: true`、`sandbox: true`。
- `preload` 仅暴露白名单 API（`window.api.task / asset / settings`），不暴露 `ipcRenderer` 原始对象。

---

## 10. 非功能性指标（验收门槛）

| 指标 | 目标 | 测量条件 |
|---|---|---|
| 爆款裂变单条耗时 | ≤ 8 min | 30s 原视频；不含下载 |
| 前贴生成耗时 | ≤ 5 min | 7s 前贴；含拼接 |
| 数字人口播耗时 | ≤ 6 min | 30s 视频；含 TTS 与合成 |
| 并发任务数 | 1-2 | 配置项，默认 1 |
| 崩溃恢复 | 100% | kill -9 主进程后重启，未完成任务可在 UI 一键续跑 |
| API 失败重试 | 3 次（指数退避） | 仍失败 → `failed`，可手动重试 |

---

## 11. 安全 / 合规

- 用户素材**只在调用云端 API 时按需上传**；不进产品服务方任何后台；不入产品侧数据库。
- API Key：`secure/keystore.ts` 用 OS Keychain（`keytar`）派生密钥 + AES-256-GCM 加密后存 `settings`；解密只在主进程内完成。
- UI Settings 页须展示：本产品会向哪些服务商发送数据 + 各家隐私政策链接（来自配置文件）。
- 抖音下载提示：仅供个人学习与素材分析，版权合规由用户承担（首启动弹窗确认一次）。
- 日志：`electron-log` 默认仅本地落盘，**不上报外网**；Sentry 关闭或仅离线模式。

---

## 12. 打包与发布

- `electron-builder.yml` 输出：
  - Windows：`.exe`（NSIS）
  - macOS：`.dmg`（Intel + Apple Silicon 双包，或 universal）
  - Linux：`.AppImage`
- 随包二进制：`ffmpeg-static`、`yt-dlp`（按平台）。
- 自动更新可选，默认关闭；若启用须指向可信内网/OSS。
- 首次启动：
  1) 初始化 SQLite + migration；
  2) 内置数字人入库（拷贝 `resources/avatars/*` 到 `userData/avatars/`）；
  3) 引导填入 Seedance2.0 / LLM / TTS / ASR 的 API Key；
  4) 弹出版权合规提示。

---

## 13. 测试要求

### 13.1 单元测试（vitest）

必须覆盖：

- `model-client/*`：mock `undici.fetch`；验证重试、限流、错误分类。
- `pipelines/explosion`：mock `ModelClient`；验证步骤顺序、产物路径、失败恢复点。
- `pipelines/pretrailer`：含 `understanding.confidence` 阈值分支、过渡时长。
- `pipelines/avatar`：含 `validate_avatar` 失败、卖点 ≥ 2 校验、时间锚点 ±1s 校验。
- `db/schema`：迁移幂等性、外键级联删除。
- `queue/recover`：`running → paused`、`paused → retry` 跳过已 `success` 步骤。
- `secure/keystore`：加解密往返；明文不入磁盘。

### 13.2 E2E（playwright + electron）

- 创建 3 种任务并完成（mock 网络层）；
- 杀掉主进程 → 重启 → 任务出现在 `paused`，可续跑；
- 设置页填入 Key 后能持久化并解密成功；
- 素材库可定位本地文件夹（spawn 调用断言）。

---

## 14. 错误码（对外文案 / 内部代号）

| 代号 | 含义 | UI 文案（中文） |
|---|---|---|
| `E_INPUT_VALIDATION` | 入参非法 | "输入参数不合法：{detail}" |
| `E_DOWNLOAD_FAILED` | 抖音下载失败 | "视频下载失败，请检查链接或网络" |
| `E_MODEL_API_FAILED` | 云端模型 API 重试后仍失败 | "云端服务暂不可用：{service}，请稍后重试" |
| `E_FFMPEG_FAILED` | FFmpeg 处理失败 | "本地视频处理失败，请重试" |
| `E_AVATAR_INVALID` | 数字人图片不合格 | "数字人图片需为正面、清晰、单人，请重选" |
| `E_LOW_CONFIDENCE` | 内容理解置信度不足 | "视频内容理解置信度不足，请更换素材或重试" |
| `E_CTA_LOST` | 重写丢失 CTA 关键词 | "文案重写丢失关键卖点，请重试" |
| `E_KEYSTORE_FAILED` | Key 加解密失败 | "本地密钥访问失败，请检查系统钥匙串权限" |

---

## 15. 范围外（明确不实现）

- 用户登录 / 注册 / 找回密码 / 权限管理 / 计费 / 多租户
- SaaS 化、云端控制台
- 广告投放平台对接（巨量、千川等）
- 实时直播、电商挂车
- A/B 测试与归因分析
- 本地 GPU 推理服务、模型权重管理、Docker 编排

---

## 16. 开发交付里程碑（建议）

| M | 范围 | 交付 |
|---|---|---|
| M1 | 工程脚手架 + 进程模型 + SQLite + Settings 页（含 Key 加密） | 可启动空壳，能存读 Key |
| M2 | ModelClient 全部接口 + mock 联调 | 单测全绿 |
| M3 | 功能一 Pipeline + UI | 跑通端到端 demo |
| M4 | 功能二 + 功能三 Pipeline + UI | 三大能力联通 |
| M5 | 任务队列断点续跑 + 素材库 + 打包 | 三端安装包 |
| M6 | 性能调优 + E2E + 文档 | 达到 §10 指标 |

---

## 17. 实现禁忌（AI 代码生成需避开）

- ⛔ 不要在渲染进程直接 `require('fs')` / 直连外网 API / 持有 API Key。
- ⛔ 不要引入 Python / Sidecar / 本地 HTTP server / Docker。
- ⛔ 不要把 API Key 写入日志、源码、`.env` 默认值或 IPC 返回体。
- ⛔ FFmpeg / yt-dlp 必须用随包二进制路径，不依赖系统 PATH。
- ⛔ SQLite 写操作不要从多进程发起；只走主进程串行。
- ⛔ `overwrite` 文件前先备份到 `artifacts/_trash/`，不要静默覆盖用户数据。
- ⛔ 任务步骤 `success` 后**不得**重跑（除非显式 `retry-step`），避免重复消耗云端配额。
