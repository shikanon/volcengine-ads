# AGENTS.md

---

## 1. 项目速览

- **名称**：`volcengine-ads`
- **仓库**：https://github.com/shikanon/volcengine-ads
- **形态**：Electron 桌面应用（私有化个人版，无登录 / 无多租户 / 无计费）
- **三大能力**：广告爆款裂变 / 广告前贴 / 数字人口播
- **重型 AI 推理**：全部走云端 API（Seedance2.0 / LLM / TTS / ASR），**本地不部署 GPU 模型**
- **完整产品规格**：见 [`spec.md`](./spec.md)（这是 single source of truth，与本文件不一致时以 `spec.md` 为准）

---

## 2. 必读顺序

Agent 在开始任何任务前，按顺序阅读：

1. `AGENTS.md`（本文件）
2. `spec.md`（产品 + 实现规格）
3. 任务相关的 `src/**` 现有代码（用 Grep / Read 局部加载，禁止全量 dump）

---

## 3. 仓库结构（与 spec.md §2 一致）

```
src/
├── main/           # Electron 主进程：IPC、SQLite、ModelClient、Pipeline、FFmpeg
├── preload/        # contextBridge API 暴露
├── renderer/       # React UI（页面、组件、zustand stores）
└── shared/         # 主/渲染共享类型与 IPC channel 常量
tests/
├── unit/           # vitest
└── e2e/            # playwright + electron
```

**职责边界**：
- 主进程是唯一持有 SQLite、文件 I/O、外网 HTTPS、子进程的进程
- 跨进程通讯**只走** `src/shared/ipc-channels.ts` 中定义的 channel

---

## 4. 开发命令（Agent 直接调用）

| 场景 | 命令 |
|---|---|
| 安装依赖 | `npm ci` |
| 开发模式（渲染热更新 + Electron 主进程） | `npm run dev` |
| 类型检查 | `npm run typecheck` |
| Lint | `npm run lint` |
| Lint 自动修复 | `npm run lint:fix` |
| 格式化 | `npm run format` |
| 单元测试 | `npm test` |
| 单测 watch | `npm run test:watch` |
| 覆盖率 | `npm run test:coverage` |
| E2E 测试 | `npm run test:e2e` |
| 打包当前平台 | `npm run build` |
| 打包全平台 | `npm run build:all` |
| 数据库 migration 重置（本地）| `npm run db:reset` |

> 每次开发完成后，Agent 必须先完成测试校验，再执行打包验证：`npm run typecheck && npm run lint && npm test && npm run build`。若任务仅修改文档或说明文字，可说明原因后跳过打包。

---

## 5. 代码风格

### 5.1 TypeScript

- **严格模式**：`tsconfig` 开启 `strict: true`、`noUncheckedIndexedAccess: true`、`exactOptionalPropertyTypes: true`
- **禁止** `any`（必要时用 `unknown` 并配合类型守卫）；禁止 `// @ts-ignore`，必须用 `// @ts-expect-error: <reason>`
- 导出类型用 `interface`（对象）/ `type`（联合、映射、工具类型）；不要 `enum`，用字符串字面量联合
- 共享类型放 `src/shared/types.ts`，不允许主/渲染层各自复制定义

### 5.2 命名

| 对象 | 规范 | 示例 |
|---|---|---|
| 文件名 | `kebab-case.ts` | `model-client.ts` |
| React 组件文件 | `PascalCase.tsx` | `TaskCard.tsx` |
| 类型 / 接口 | `PascalCase` | `TaskRecord` |
| 函数 / 变量 | `camelCase` | `createTask` |
| 常量 | `SCREAMING_SNAKE_CASE` | `MAX_VARIANT_COUNT` |
| IPC channel | `<domain>:<action>` | `task:create` |
| Pipeline step | `snake_case` | `audio_replace` |

### 5.3 模块边界

- `src/main/**` ⛔ 不得 `import` 任何 `src/renderer/**`
- `src/renderer/**` ⛔ 不得 `import` 任何 `src/main/**`
- 两侧只能 `import` `src/shared/**`
- 任何新增 IPC channel 必须先在 `src/shared/ipc-channels.ts` 注册常量再使用

### 5.4 React

- 函数组件 + Hooks；禁止 class component
- 状态管理统一用 `zustand`；不引入 Redux / MobX
- 副作用最小化：API 调用走 IPC，组件内只做编排与展示
- 列表必须有稳定 `key`（用业务 id，非 index）

### 5.5 错误处理

- 主进程所有异步函数必须 `try/catch` 或返回 `Result<T, E>` 风格
- 抛出错误使用项目内 `AppError` 类，携带 `code`（见 spec.md §13）+ `cause`
- ⛔ 禁止 `catch` 后静默吞错；至少 `log.error` 一次并向上抛或转换为 `AppError`

---

## 6. 数据库（SQLite）

- 唯一连接持有者：`src/main/db/index.ts`
- 所有 schema 变更必须新增 migration 文件 `src/main/db/migrations/NNNN_<desc>.sql`，禁止改历史 migration
- 写操作必须串行（`better-sqlite3` 同步驱动天然满足）；事务用 `db.transaction(() => { ... })()` 包裹
- 表结构以 spec.md §4 为准；新增表/字段必须先更新 spec 再写 migration

---

## 7. 外部 API 调用

- 所有云端模型调用 **必须** 经 `src/main/model-client/` 适配层；⛔ 禁止在 pipeline 或 IPC handler 里直接 `fetch` 外网
- 统一加：`pLimit(2)` 并发控制 + `pRetry(3, factor:2)` 指数退避
- 单元测试中所有外呼必须 mock；E2E 默认使用 mock server

---

## 8. Pipeline 实现规则（spec.md §8）

为三大功能新增/修改步骤时：

1. step 名称、顺序、产物路径必须与 spec.md §8 表格**完全一致**
2. 每个 step 实现为独立 async 函数 `runStep(ctx: StepContext): Promise<StepResult>`
3. step 入口必须：
   - 检查上游 artifact 是否存在（断点续跑）
   - 写 `task_steps.status='running'` + `started_at`
   - 推送 `event:task-progress` 进度事件
4. step 出口必须：
   - 落盘 artifact 至 `userData/artifacts/<task_id>/<step>.<ext>`
   - 写 `task_steps.status='success'` + `artifact_path` + `finished_at`
5. 失败时：写 `status='failed'` + `error`，整任务暂停；⛔ 不要在 step 内自行无限重试（重试由 ModelClient 层负责）

---

## 9. 测试要求

### 10.1 必写单测的模块

- `src/main/model-client/**`（mock `undici.fetch`，验证重试 / 限流 / 错误分类）
- `src/main/pipelines/**`（mock ModelClient，验证 step 顺序 / 产物路径 / 断点续跑）
- `src/main/db/**`（migration 幂等性、外键级联）
- `src/main/queue/recover.ts`（running→paused、retry 跳过 success step）

### 10.2 覆盖率门槛

- 主进程核心模块（`model-client` / `pipelines` / `queue` / `secure`）：**行覆盖 ≥ 80%**
- 整体：≥ 70%

### 10.3 E2E 必跑场景

- 三种任务各创建并跑完（mock 网络层）
- 杀掉主进程 → 重启 → `paused` 任务可续跑
- 素材库可调用系统文件管理器定位本地文件夹

---

## 10. Git / PR 规范

### 10.1 分支命名

- `feat/<scope>-<short-desc>`：新功能
- `fix/<scope>-<short-desc>`：修复
- `refactor/<scope>-<short-desc>`：重构
- `chore/<scope>-<short-desc>`：杂项 / 构建
- `<scope>` 例：`explosion`、`pretrailer`、`avatar`、`queue`、`db`、`ui`、`build`

### 10.2 Commit Message（Conventional Commits）

```
<type>(<scope>): <subject>

<body>

<footer>
```

- `type`：`feat | fix | refactor | chore | test | docs | perf | build | ci`
- 中文/英文均可，但单仓库内保持一致（建议中文 subject）
- body 说明 **why**，不只是 what
- 涉及 spec 变更必须同步更新 `spec.md` 并在 footer 引用：`Spec: §8.1`

### 10.3 PR Checklist（Agent 在创建 PR 前自检）

- [ ] `npm run typecheck` 通过
- [ ] `npm run lint` 通过
- [ ] `npm test` 通过
- [ ] 开发完成后已执行 `npm run build` 打包验证（纯文档变更除外）
- [ ] 每次提交前检查变更内容，确认密钥等敏感信息不会提交到远程代码仓库
- [ ] 新增/修改了 IPC channel → 已注册到 `src/shared/ipc-channels.ts`
- [ ] 涉及 schema 变更 → 已新增 migration 文件
- [ ] 涉及 spec 行为变更 → 已同步更新 `spec.md`
- [ ] 新增模块附带最小单测
- [ ] 影响打包/依赖 → 已本地 `npm run build` 验证

---

## 11. Agent 行为约束（重要）

### 11.1 准许

- 读取仓库任意文件（除 `userData/` / `node_modules/`）
- 创建、修改、删除 `src/**`、`tests/**`、`docs/**`、根配置文件
- 运行 §4 列出的 npm scripts
- 提交 commit、创建 PR

### 11.2 禁止

- ⛔ 删除或修改 `spec.md` 中已定义的契约（数据模型、ModelClient 接口、Pipeline step 名）；如确需变更必须先与人类确认并同步 spec
- ⛔ 引入 spec.md §1 锁定版本之外的核心依赖（Electron / React / better-sqlite3 / undici 等）
- ⛔ 引入 Python / sidecar 进程 / Docker / Redis / 消息队列
- ⛔ 密钥、Token、凭证等敏感信息不得提交到远程代码仓库；每次提交前必须检查变更内容
- ⛔ 修改 `userData/` 下用户实际数据；测试必须用临时目录
- ⛔ 跳过本文件 §10.3 的 PR Checklist 直接合并

### 11.3 不确定时的策略

- 需求/契约模糊 → 在 PR 描述中列出疑问，**不要**自行假设并实现
- 与 `spec.md` 冲突 → 以 `spec.md` 为准；若 spec 本身有歧义 → 暂停并询问
- 命令失败 → 看 `spec.md` §13 错误码表 + 本文件 §5.5 错误处理；连续 3 次失败立即停止并报告，不要无脑重试

---

## 12. 任务模板（Agent 接到新需求时按此组织产出）

```
## 目标
<一句话>

## 涉及 spec 章节
<spec.md §X.Y>

## 设计要点
- <要点 1>
- <要点 2>

## 变更清单
- [ ] src/...
- [ ] tests/...
- [ ] spec.md（如有）

## 自验
- [ ] typecheck / lint / test / build
- [ ] §10.3 Checklist

## 风险与回滚
<...>
```

---

## 13. 常见任务 Playbook

| 任务 | 关键步骤 |
|---|---|
| **新增一个 Pipeline step** | ① spec.md §8 表格加行 → ② `src/main/pipelines/<feature>/<step>.ts` 实现 → ③ 注册到 pipeline 入口 → ④ 加单测 mock 上游 artifact → ⑤ 更新进度权重 |
| **接入新模型服务商** | ① `src/main/model-client/<vendor>.ts` 实现 `ModelClient` 子集 → ② Settings 页加配置项 → ③ 加 retry/limit → ④ mock 单测 |
| **新增 UI 页面** | ① 在 `renderer/pages/` 加文件 → ② 路由注册 → ③ store 若需扩展 → ④ IPC channel 走主进程 → ⑤ 加 E2E |
| **变更 DB schema** | ① spec.md §4 更新 DDL → ② 新增 `migrations/NNNN_*.sql` → ③ `db/schema.ts` 同步类型 → ④ migration 幂等单测 |
| **修 bug** | ① 写最小复现单测（红） → ② 修代码（绿）→ ③ 回归相关 E2E |

---

## 14. 与人类沟通的输出格式

Agent 在 PR / 工作日志中：

- 使用中文（与产品文档语言一致）
- 引用 spec 用 `spec.md §X.Y` 格式
- 引用代码用 ``` `src/main/xxx.ts:42` ``` 格式（含行号）
- 不要 emoji、不要营销式措辞、不要"完美！""非常好！"等空话
- 不确定 / 假设必须明确标注 `[假设]` 前缀
