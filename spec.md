# 六行业爆款广告素材生成



## 3. 工作流 DAG

| # | 节点 | 实现位置 | 关键依赖 |
|---|---|---|---|
| N1 | IndustryRouter | Main / orchestrator/nodes/ | js-yaml 加载 KB |
| N2 | ConceptPlanner | Main | Doubao LLM SDK (axios) |
| N3 | ScriptWriter | Main | Doubao LLM (JSON mode) |
| N4 | StoryboardBuilder | Main | Doubao LLM |
| N5 | ComplianceGate (Pre) | Main | 本地词库 + LLM 兜底 |
| N6 | AssetGenerator | Main + UtilityProcess | Seedance / Seedream / 火山TTS（p-limit 并发） |
| N7 | ConsistencyChecker | UtilityProcess (vlm-worker) | Doubao VLM + sharp 抽帧 |
| N8 | Composer + Post-Compliance | UtilityProcess (ffmpeg-worker) | fluent-ffmpeg + ffmpeg-static |

当前 Electron 版本将六行业原生生成收敛为 `native` 任务类型，pipeline step 名称使用 snake_case：

1. `industry_router`：写入 `industry.json`
2. `concept_planner`：写入 `concepts.json`
3. `script_writer`：写入 `scripts.json`
4. `script_confirm`：展示 `scripts.md` 并进入 `waiting_confirmation`，由用户确认脚本文案后继续
5. `storyboard_builder`：写入 `storyboard.json`
6. `compliance_pre`：写入 `compliance_pre.json`
7. `asset_generator`：写入 `assets.json`。单次 Seedance 生成片段必须控制在 4..15s；当 `durationSec` 超过 15s 时，按多个片段生成（如 25s = 15s + 10s），记录每段成功/失败状态，最终用 FFmpeg 拼接为单条成片。
8. `consistency_checker`：写入 `consistency.json`
9. `composer`：写入 `finals.json` 并入库成片

广告爆款裂变、原生爆款素材生成、广告前贴生成、广告数字人口播都必须在脚本文案生成后、视频/音频生成前进入 `script_confirm` 确认环节。确认节点不调用模型，仅复用上游脚本文案产物供用户预览；任务状态为 `waiting_confirmation` 时，用户确认后通过 `task:confirm-script` 将该节点标记为 `success` 并恢复排队继续执行。

## 3.1 视频理解输入策略

- 所有名为“视频理解”或承担原片视觉理解职责的节点，必须把完整视频文件直接输入大语言模型的视频理解接口（`ModelClient.visionVideo(videoPath, prompt)`）。
- 禁止在视频理解阶段把视频抽帧成图片后调用图片理解接口；不再生成或依赖 `keyframes/`、`understand_frames/` 等关键帧目录。
- 允许为 ASR、音频替换、FFmpeg 合成等非理解场景单独提取音频；允许为视频生成参考单独裁剪参考视频，但这些产物不得替代视频理解输入。
- 产品设计上，“视频理解”节点展示为完整视频理解：输入为规范化后的 `source.mp4`，输出为结构化 JSON（如 `understanding.json` 或 `script_parse.json`），用于后续文案、分镜和一致性判断。


## 5. 行业差异化策略矩阵

| 行业 | 核心公式 | 时长 | 必备模块 | 合规重点 |
|---|---|---|---|---|
| 游戏 | 钩子+爽点+成长+福利+CTA | 15-30s | 玩法录屏占位 / 角色立绘 / 福利前置 | 反外挂、价值观、第三方 IP 授权 |
| 短剧 | 黄金 3s 高光 + 2-3min 小闭环 + 1min 悬念钩 | 60s-5min | 调色情绪映射 / 花字 / 卡点剪辑 | 暴力分级、版权 |
| 小说 | 15s AI 钩子前贴 + 解压/滚屏拼接 | 15-60s | 人物参考图固化 / 六段式信息流脚本 | AIGC 命名规范 |
| 社交 | 起承转合四段式 | 15-30s | 不露脸自拍 / 聊天记录截图 | 不良暗示词库 + 不实宣传词库 |
| 工具 | 痛点 + 真人口播 + UI 演示 + CTA | 15-30s | 数字人口播 / UI 占位 / 创意空镜 | 真实承诺、无虚假宣传 |
| 电商 | 场景痛点 + 商品卖点 + 证据背书 + 权益刺激 + CTA | 15-30s | 商品特写 / 使用场景 / 卖点对比 / 促销权益 | 价格真实性、促销规则、功效承诺、品牌授权 |

## 5.1 `native` 输入契约

```typescript
type NativeIndustry = 'game' | 'short_drama' | 'novel' | 'social' | 'tool' | 'ecommerce';
type NativeRatio = '9:16' | '16:9' | '1:1';

interface NativeInput {
  industry: NativeIndustry;
  brief: string;
  productName?: string;
  referenceVideoPath?: string;
  variantCount: number; // 1..5
  durationSec: number;  // game/social/tool/ecommerce: 15..30, novel: 15..60, short_drama: 15..300
  ratio: NativeRatio;
}
```


## 4. IPC 通信契约（强类型）

```typescript
// src/shared/ipc-channels.ts
export const IPC = {
  TASK_CREATE: 'task:create',
  TASK_LIST: 'task:list',
  TASK_GET: 'task:get',
  TASK_CANCEL: 'task:cancel',
  TASK_DELETE: 'task:delete',
  TASK_CLONE: 'task:clone',
  TASK_RETRY_NODE: 'task:retryNode',
  TASK_CONFIRM_SCRIPT: 'task:confirm-script',
  TASK_PROGRESS: 'task:progress',          // Main → Renderer push
  KB_GET: 'kb:get',
  KB_UPDATE: 'kb:update',
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  ASSET_REVEAL: 'asset:reveal',            // shell.showItemInFolder
} as const;

// src/preload/index.ts
import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../shared/ipc-channels';

contextBridge.exposeInMainWorld('api', {
  task: {
    create: (req) => ipcRenderer.invoke(IPC.TASK_CREATE, req),
    list: () => ipcRenderer.invoke(IPC.TASK_LIST),
    get: (id) => ipcRenderer.invoke(IPC.TASK_GET, id),
    cancel: (id) => ipcRenderer.invoke(IPC.TASK_CANCEL, id),
    delete: (id) => ipcRenderer.invoke(IPC.TASK_DELETE, id),
    clone: (id) => ipcRenderer.invoke(IPC.TASK_CLONE, id),
    retryNode: (id, node) => ipcRenderer.invoke(IPC.TASK_RETRY_NODE, id, node),
    confirmScript: (id) => ipcRenderer.invoke(IPC.TASK_CONFIRM_SCRIPT, { taskId: id }),
    onProgress: (cb) => {
      const listener = (_e, data) => cb(data);
      ipcRenderer.on(IPC.TASK_PROGRESS, listener);
      return () => ipcRenderer.off(IPC.TASK_PROGRESS, listener);
    },
  },
  kb: { /* ... */ },
  settings: { /* ... */ },
});

// Renderer 端 d.ts
declare global {
  interface Window { api: ApiSurface; }
}
```

**IPC 规范硬约束**：
- 严禁 `nodeIntegration: true`、严禁 `contextIsolation: false`
- 严禁 `ipcRenderer.send`（无返回）；统一 `invoke / handle` 模式
- 进度推送统一走 `webContents.send(IPC.TASK_PROGRESS, ...)`，Renderer 用 `useEffect` 订阅+卸载
- 任何 IPC 入口必须先用 Zod 校验 payload，校验失败抛 `ValidationError`

**任务操作语义**：
- `task:cancel`：排队任务直接进入 `canceled`；运行中任务标记当前 running 节点为 `canceled`，当前云端调用返回后不再执行后续节点。
- `task:delete`：删除任务记录与节点记录，已入库素材保留；运行中的任务必须先取消并等待执行器释放。
- `task:clone`：复制原任务 `type + input`，创建新的 `queued` 任务与全新节点，并立即进入队列。
- `task:confirm-script`：仅允许 `waiting_confirmation` 任务调用；将当前 `script_confirm` 节点标记为 `success`，任务恢复为 `queued` 并继续后续节点。

## 5. DAG Runner 实现规范

```typescript
// src/main/orchestrator/dag-runner.ts
import { EventEmitter } from 'node:events';
import { Node } from './node.base';
import { TaskState } from '../../shared/types';

export class DagRunner extends EventEmitter {
  constructor(private nodes: Node[]) { super(); }

  async run(initialState: TaskState): Promise<TaskState> {
    let state = initialState;
    for (const node of this.nodes) {
      this.emit('node:start', { taskId: state.taskId, node: node.name });
      const t0 = Date.now();
      let attempt = 0;
      while (attempt <= node.maxRetries) {
        try {
          state = await withTimeout(node.run(state), node.timeoutMs);
          state.trace.push({
            nodeName: node.name, status: 'succeeded',
            durationMs: Date.now() - t0, ts: Date.now(),
          });
          await persistState(state);
          this.emit('node:done', { taskId: state.taskId, node: node.name });
          break;
        } catch (err) {
          attempt++;
          if (attempt > node.maxRetries) {
            state.trace.push({
              nodeName: node.name, status: 'failed',
              durationMs: Date.now() - t0, error: String(err), ts: Date.now(),
            });
            await persistState(state);
            this.emit('node:fail', { taskId: state.taskId, node: node.name, err });
            throw err;
          }
          state.trace.push({
            nodeName: node.name, status: 'retried',
            durationMs: Date.now() - t0, ts: Date.now(),
          });
        }
      }
    }
    return state;
  }
}

// src/main/orchestrator/node.base.ts
export abstract class Node {
  abstract name: string;
  maxRetries = 2;
  timeoutMs = 120_000;
  abstract run(state: TaskState): Promise<TaskState>;
}
```

**N6 并发规范**：

```typescript
// src/main/orchestrator/nodes/n6-assets.ts
import pLimit from 'p-limit';

export class AssetGeneratorNode extends Node {
  name = 'AssetGenerator';
  timeoutMs = 15 * 60_000;

  async run(state: TaskState): Promise<TaskState> {
    const limit = pLimit(4);  // 最多 4 并发，受 API 限流
    const tasks = state.script!.shots.map((shot) =>
      limit(async () => {
        // 1. 人物参考图：复用缓存
        const refId = await ensureCharacterRef(state, shot);
        // 2. 场景图
        const imageUrl = await seedream.textToImage(shot.imagePrompt);
        // 3. 视频
        const videoUrl = await seedance.textToVideo(shot.videoPrompt, {
          ratio: state.request.ratio,
          duration: shot.duration,
          referenceImages: [refId, imageUrl],
          mode: 'omni_reference',
        });
        // 4. 配音
        const audioUrl = shot.voiceoverText
          ? await tts.synthesize(shot.voiceoverText, { /* kb.voice */ })
          : undefined;
        state.assets[shot.index] = { imageUrl, videoUrl, audioUrl };
      })
    );
    await Promise.all(tasks);
    return state;
  }
}
```

## 6. Utility Process（FFmpeg / VLM）规范

```typescript
// src/main/services/ffmpeg-runner.ts
import { utilityProcess, MessageChannelMain } from 'electron';
import path from 'node:path';

export async function composeVideo(input: ComposeInput): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = utilityProcess.fork(
      path.join(__dirname, '../workers/ffmpeg.worker.js'),
      [],
      { serviceName: 'ffmpeg-worker', stdio: 'pipe' }
    );
    proc.postMessage({ type: 'compose', input });
    proc.on('message', (msg: any) => {
      if (msg.type === 'done') { resolve(msg.outputPath); proc.kill(); }
      if (msg.type === 'error') { reject(new Error(msg.error)); proc.kill(); }
    });
  });
}

// src/main/workers/ffmpeg.worker.ts —— 跑在独立进程
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
ffmpeg.setFfmpegPath(ffmpegPath!);

process.parentPort.on('message', (e) => {
  const { type, input } = e.data;
  if (type === 'compose') {
    const cmd = ffmpeg();
    input.shots.forEach((s: any) => cmd.input(s.videoUrl));
    cmd
      .complexFilter([/* concat + bgm + 字幕 */])
      .on('end', () => process.parentPort.postMessage({ type: 'done', outputPath: input.outputPath }))
      .on('error', (err) => process.parentPort.postMessage({ type: 'error', error: err.message }))
      .save(input.outputPath);
  }
});
```

**强约束**：FFmpeg / sharp / VLM 抽帧必须跑在 Utility Process，禁止在 Main 直接调用，否则会阻塞 IPC。


## 9. Compliance Service 规范

```typescript
// src/main/services/compliance.service.ts
export class ComplianceService {
  constructor(private kb: KnowledgeBase, private vlm: DoubaoVLMClient) {}

  checkText(text: string): ComplianceResult {
    // 1. 精确词匹配
    const hits = this.kb.compliance.blacklistWords.filter((w) => text.includes(w));
    if (hits.length) return { pass: false, hits, reason: 'blacklist' };
    // 2. 正则
    // 3. LLM 兜底（高级）
    return { pass: true };
  }

  async checkImage(imagePath: string): Promise<ComplianceResult> {
    return await this.vlm.classify(imagePath, this.kb.compliance.imageRules);
  }

  async checkVideo(videoPath: string): Promise<ComplianceResult> {
    // utilityProcess 抽帧 → VLM 检测 → 火山 ASR 字幕检测
  }
}
```

**行业硬规则**（保持与 v1 一致）：social 严禁 `["免费","加微信","3S","直奔主题"]` + 禁场景 `["床","浴室","酒店走廊","玉米地"]`；novel 强制命名正则 `^AIGC_novel_.+\.mp4$`；game 拦截 `["外挂","代练","100%中奖"]`；任何行业违禁触发回 N3 重写，连续 2 次失败 → FAILED。
