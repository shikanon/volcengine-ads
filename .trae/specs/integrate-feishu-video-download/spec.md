# 飞书文档视频下载集成 Spec

## Why
当前飞书文档视频下载能力只存在于临时脚本中，已经验证可行，但没有沉淀成项目内可复用的方法，也无法通过现有任务系统稳定调用。需要把这条下载链路封装进 Electron 主进程，并接入项目现有的任务、进度和产物体系。

## What Changes
- 新增主进程可复用的飞书文档视频下载方法，负责解析飞书 `wiki/docx` 页面中的视频块并下载到本地。
- 新增一个最小任务类型，使飞书视频下载能力可通过现有 `task:create -> worker -> pipeline` 主链路运行。
- 新增一页轻量表单，让用户可以在应用内输入飞书链接并发起下载任务。
- 下载结果写入任务 artifact，并生成结构化 `download-summary.json` 供任务详情和素材库后续复用。
- 将样本脚本中的浏览器会话复用、`box/file/info`、`stream/download/video`、清晰度降级和有限重试策略迁移到项目代码中。

## Impact
- Affected specs: 任务类型扩展、主进程下载服务、IPC 任务创建、任务校验、Pipeline 产物管理、Renderer 页面接入
- Affected code: `src/shared/types.ts`、`src/main/validation.ts`、`src/main/pipelines/**`、`src/main/queue/worker.ts`、`src/main/ipc/task.ts`、`src/preload/index.ts`、`src/renderer/App.tsx`、`src/renderer/pages/**`

## ADDED Requirements
### Requirement: 主进程飞书视频下载方法
系统 SHALL 在主进程提供一个可复用的方法，用于从飞书 `wiki/docx` 页面中发现并下载视频文件。

#### Scenario: 输入飞书链接开始下载
- **WHEN** 调用方传入飞书 `wiki` 或 `docx` 链接以及下载目录等参数
- **THEN** 主进程方法解析页面、发现视频块、下载视频文件，并返回结构化结果而不是仅打印日志

#### Scenario: 视频存在多个转码清晰度
- **WHEN** 某个视频块没有 `720p`，但存在其他 `transcode_urls`
- **THEN** 方法按预设优先级选择最高可用清晰度继续下载，而不是直接判定失败

#### Scenario: 网络抖动或接口超时
- **WHEN** `box/file/info` 或 `stream/download/video` 请求出现超时、连接重置等可恢复错误
- **THEN** 方法执行有限重试，并在超过重试上限后记录失败原因

### Requirement: 任务化集成
系统 SHALL 将飞书视频下载作为新的任务类型接入现有队列与 pipeline 体系。

#### Scenario: 用户在应用内创建下载任务
- **WHEN** 用户在 Renderer 页输入飞书链接并提交
- **THEN** 请求通过现有 `task:create` 进入主进程，由 `TaskWorker` 排队执行，并持续推送下载进度

#### Scenario: 下载任务成功
- **WHEN** 飞书视频下载任务完成
- **THEN** 系统将任务状态标记为 `success`，并把下载目录或 `download-summary.json` 路径写入任务步骤 artifact

#### Scenario: 下载任务失败
- **WHEN** 所有可用下载策略都失败，或浏览器会话不可用
- **THEN** 系统将任务标记为 `failed`，并保存结构化失败原因，便于用户重试

### Requirement: 输入校验与结果留痕
系统 SHALL 为飞书视频下载任务定义明确输入契约，并对下载结果做本地校验和结构化留痕。

#### Scenario: 输入参数不合法
- **WHEN** 用户提交空链接、非飞书链接或非法输出目录参数
- **THEN** 系统在任务创建前拒绝该请求，并返回输入校验错误

#### Scenario: 下载结果落地成功
- **WHEN** 任一视频文件下载完成
- **THEN** 系统检查目标文件存在且大小大于 0，并将文件名、路径、大小、MIME 类型写入汇总结果

#### Scenario: 浏览器登录态失效
- **WHEN** Playwright 复用页面会话时拿不到必要 cookie 或飞书返回未授权
- **THEN** 系统在结果中明确指出需要重新登录飞书后再重试

### Requirement: 应用内可用入口
系统 SHALL 在现有应用导航中提供一个最小可用入口，用于创建飞书视频下载任务。

#### Scenario: 用户打开下载页面
- **WHEN** 用户进入新增页面
- **THEN** 页面展示飞书链接输入、输出目录说明、结果说明和任务提交入口，并复用现有“最近任务”展示

## MODIFIED Requirements
### Requirement: 任务类型支持范围
系统现有任务类型集合需要扩展，使飞书视频下载可以和 `explosion`、`pretrailer`、`avatar`、`native`、`copywriting` 一样被统一创建、校验、排队和执行。

## REMOVED Requirements
### Requirement: 仅通过临时脚本触发飞书视频下载
**Reason**: 临时脚本已完成可行性验证，但不满足项目内复用、输入校验、进度推送和任务留痕要求。
**Migration**: 将脚本能力迁移到主进程方法和 pipeline 中；脚本可保留为调试或回归参考，但不再作为产品内唯一入口。
