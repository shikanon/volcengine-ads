# 七行业爆款广告素材生成



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

当前 Electron 版本将七行业原生生成收敛为 `native` 任务类型，pipeline step 名称使用 snake_case：

1. `industry_router`：写入 `industry.json`
2. `concept_planner`：写入 `concepts.json`
3. `script_writer`：写入 `scripts.json`
4. `script_confirm`：展示 `scripts.md` 并进入 `waiting_confirmation`，由用户确认脚本文案后继续
5. `storyboard_builder`：写入 `storyboard.json`
6. `compliance_pre`：写入 `compliance_pre.json`
7. `video_prompt_optimize`：写入 `video_prompts.json`，在调用 Seedance 前把脚本、分镜、参考素材策略和合规约束整理为最终视频生成提示词。
8. `asset_generator`：写入 `assets.json`。单次 Seedance 生成片段必须控制在 4..15s；当 `durationSec` 超过 15s 时，按多个片段生成（如 25s = 15s + 10s），记录每段成功/失败状态，最终用 FFmpeg 拼接为单条成片。
9. `consistency_checker`：写入 `consistency.json`。该节点用于精品化质检与修复参考，不作为阻断节点；当一致性不足时只记录告警、修复建议和重生成策略，任务仍继续进入 `composer`
10. `composer`：写入 `finals.json` 并入库成片

广告文案脚本编写使用 `copywriting` 任务类型，是与原生广告生成、爆款广告裂变、广告前贴、数字人口播并列的一级模块。它面向“输入需求 → 匹配行业模板 → 大模型优化模板 → 联网补充产品/热点信息 → 拆解需求 → 深度策略分析 → 输出爆款广告脚本”的复杂 Agent 工作流，不进入视频/音频生成节点：

1. `industry_router`：写入 `industry.json`，从七行业模板中匹配最适合的行业模板；用户选择具体行业时按选择路由，选择 `auto` 时根据需求文本自动匹配。
2. `template_optimize`：写入 `template.json`，使用大模型把匹配到的行业模板优化为当前需求专用的脚本公式、模块、角度库和合规规则；模型可使用高 reasoning effort，但不得输出推理链。
3. `web_research`：写入 `research.json`，通过 `ModelClient.webSearch` 调用 Ark Responses `web_search` 工具补充产品相关信息、用户关注点、平台热点和可安全借用的热梗；pipeline 不得直接外呼网络。
4. `requirement_decompose`：写入 `requirement.json`，基于优化后的行业模板和联网补充拆解产品、人群、卖点、平台语境、限制条件和创意角度。
5. `strategy_analysis`：写入 `analysis.json`，基于优化模板、联网补充和拆解结果进行钩子、转化路径、证据背书、语气和风险规避分析。
6. `script_writer`：写入 `scripts.json` 和可预览的 `scripts.md`，输出多条爆款广告脚本，并以 `script` 素材类型登记到素材库。

广告视频打分使用 `video_scoring` 任务类型，是与原生广告生成、爆款广告裂变、广告前贴、数字人口播、广告文案脚本并列的一级模块。它面向“输入本地视频 + 手动选择广告类型（品牌/买量/创意）→ 直接以完整视频做理解与打分 → 输出分维度分数、证据、分析与优化建议”的结构化评估流程，不进入视频生成节点：

1. `ingest`：写入 `source.mp4`，规范化本地输入视频，供后续完整视频理解使用。
2. `score`：写入 `score.json`，根据用户选择的广告类型调用对应评分 Prompt，直接用 `ModelClient.visionVideo(videoPath, prompt)` 返回结构化评分结果。
   - 在调用评分 Prompt 前，允许对本地音轨做一次 BGM 特征分析；当前实现使用 `meyda` 对抽取出的音频做能量、频谱和动态特征统计，并把摘要作为 Prompt 辅助上下文输入。
3. `report_writer`：写入 `report.md` 并以 `report` 素材类型登记到素材库，供任务详情与素材库定位查看。

电商图片包装使用 `ecommerce_image` 任务类型，是与视频类广告生成、广告文案脚本和广告视频打分并列的一级模块。它面向“输入本地商品主图 → 商品图理解与牛皮癣识别 → 文案生成与词性标注 → 主图美化 → 背景替换 → 渲染计划 → 文案渲染 → 入库图片素材”的电商图片包装流程，不进入视频/音频生成节点：

1. `product_understand`：写入 `product.json`，通过 `ModelClient.vision` 识别商品主体、品类、视觉特征、疑似牛皮癣/非商品文案、背景问题、可安全使用卖点和合规风险。
2. `copy_generate`：写入 `copy.json` 和 `copy.md`，通过 `ModelClient.chat` 生成主标题、副标题、徽标短语、关键词词性标注（名词/形容词/动词/其他）和文字样式策略。
3. `main_image_beautify`：写入 `beautified.png` 和 `beautify_report.json`，通过 `ModelClient.generateImage` 去除主图中非商品文案、杂乱衬底、无关 logo、水印和牛皮癣样式元素，保留商品主体、包装核心识别和广告安全背景；成功后将 `beautified.png` 以 `image` 素材类型登记到素材库，tags 至少包含 `ecommerce_image`、`beautified`、style。
4. `background_replace`：写入 `background_variant_<i>.png` 与 `backgrounds.json`，通过 Seedream 图生图能力保持商品主体不变并替换/融合背景；本地记录场景、风格、变体索引和提示词；成功后将每张 `background_variant_<i>.png` 以 `image` 素材类型登记到素材库，tags 至少包含 `ecommerce_image`、`background`、style。
5. `copy_render`：先写入 `render_plan.json`，沉淀主标题、副标题、徽标、强调关键词、颜色策略、布局约束和每个背景变体的渲染计划；再写入 `final_<i>.png` 与 `finals.json`，将主标题、副标题和徽标按渲染计划、智能配色、名词放大、描边/斜体/边框/衬底等策略渲染到包装图。`finals.json` 必须记录每张最终图的 `status`、最终图路径、源背景路径、渲染 Prompt、主标题、副标题、徽标、强调关键词、风险提示和质量说明；最终图以 `image` 素材类型登记到素材库，tags 至少包含 `ecommerce_image`、`final`、style。

广告爆款裂变、原生爆款素材生成、广告前贴生成、广告数字人口播都必须在脚本文案生成后、视频/音频生成前进入 `script_confirm` 确认环节。确认节点不调用模型，仅复用上游脚本文案产物供用户预览；任务状态为 `waiting_confirmation` 时，用户确认后通过 `task:confirm-script` 将该节点标记为 `success` 并恢复排队继续执行。

所有工作流在视频生成类节点前必须进入 `video_prompt_optimize` 节点。该节点产出可直接传给 Seedance / 数字人生成接口的最终视频提示词 artifact；后续 `seedance`、`asset_generator`、`seedance_avatar` 节点必须优先读取该 artifact 发起视频生成。

广告爆款裂变不再执行本地语音合成和音频替换。`video_prompt_optimize` 仅整理裂变脚本、分镜和参考素材策略，不生成或写入 TTS 参考音频；`seedance` 节点不传 `reference_audio`，Seedance 直出视频即最终成片并直接入库。

广告前贴的用户所选视频生成类型必须同时约束 `copy_gen` 和 `script_gen` 节点。`copy_gen` 用类型模板生成符合方向的前贴文案；`script_gen` 必须继续接收同一个类型模板，并把类型落实到每个镜头的视觉锚点、尺度/动作/场景机制和首秒钩子中，例如“巨物/微型前贴”要明确巨物或微型主体、真实环境参照物、尺度反差和轻喜剧动作。

广告前贴不再执行本地语音合成和前贴音视频合成节点。`seedance` 节点必须直接生成带声音的前贴视频；`copy_gen` 和 `script_gen` 产物只作为脚本文案确认和视频生成提示词，不再作为本地 TTS 口播输入。`concat` 节点直接拼接 `pretrailer.mp4` 与 `source.mp4`。

广告爆款裂变、原生爆款素材生成、广告前贴生成、广告数字人口播都必须支持 `resolution` 生成分辨率选项：`480p | 720p | 1080p`。未显式选择时默认 `720p`；该值必须作为视频生成或数字人生成请求的 `resolution` 参数传给模型。

## 3.1 视频理解输入策略

- 所有名为“视频理解”或承担原片视觉理解职责的节点，必须把完整视频文件直接输入大语言模型的视频理解接口（`ModelClient.visionVideo(videoPath, prompt)`）。
- 禁止在视频理解阶段把视频抽帧成图片后调用图片理解接口；不再生成或依赖 `keyframes/`、`understand_frames/` 等关键帧目录。
- 允许为 ASR、FFmpeg 合成等非理解场景单独提取音频；允许为视频生成参考单独裁剪参考视频，但这些产物不得替代视频理解输入。广告爆款裂变不再为了成片执行音频替换。
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
| 网赚 | 可信赚钱钩子 + 网赚灵感原子 + 奖励视觉/UGC 叠加 + 信任背书 + CTA | 15-30s | 网赚灵感原子 / 红包金币宝箱奖励视觉 / 大字报或利益创意 / UGC奖励叠加或真人信任套路 | 收益表达克制可信，禁止保证收益、夸大提现、虚构到账、诱导误导下载 |

网赚类素材规律来自飞书文档 `doxcnQhvGSVKjCpzfUxNTP8Uhth`：图片单卖点由背景底图、logo/警示语、网赚灵感原子透明图层组成，常见红包、宝箱、金蛋、金币、礼物盒等红黄奖励视觉；图片多卖点是在非网赚起量素材上叠加赚钱卖点。视频单卖点包含大字报滚屏、风景/解压/城市背景、红包掉落/翻动/加载等利益创意；视频多卖点是在老歌等下沉 UGC 上叠加红包、金币特效；真人类通过权威口播、感性口播、多人采访、情景剧建立“可信赚钱”感。

## 5.1 `native` 输入契约

```typescript
type NativeIndustry =
  | 'game'
  | 'short_drama'
  | 'novel'
  | 'social'
  | 'tool'
  | 'ecommerce'
  | 'money_making';
type NativeRatio = '9:16' | '16:9' | '1:1';
type VideoResolution = '480p' | '720p' | '1080p';

interface NativeInput {
  industry: NativeIndustry;
  brief: string;
  productName?: string;
  referenceVideoPath?: string;
  referenceImagePaths?: string[]; // 可选，最多 9 张
  referenceAudioPath?: string; // 可选，本地音频绝对路径
  variantCount: number; // 1..5
  durationSec: number;  // game/social/tool/ecommerce/money_making: 15..30, novel: 15..60, short_drama: 15..300
  ratio: NativeRatio;
  resolution?: VideoResolution; // default: 720p
}
```

## 5.2 `copywriting` 输入契约

```typescript
type CopywritingScriptFormat = 'short_video' | 'feed_ad' | 'live_stream';
type CopywritingIndustry = NativeIndustry | 'auto';

interface CopywritingInput {
  industry: CopywritingIndustry; // default: auto
  requirement?: string; // optional, <= 4000；为空时由模型结合结构化字段与联网搜索推断
  productName?: string; // <= 100
  audience?: string; // <= 200
  platform?: string; // <= 80
  format: CopywritingScriptFormat;
  variantCount: number; // 1..5
  durationSec: number; // 15..120
  enableWebSearch?: boolean; // default: true，是否用 Ark web_search 补充产品信息和热梗
}
```

`copywriting` 不生成视频、音频或图片，因此不要求 `script_confirm`，也不要求 `video_prompt_optimize`。最终 `scripts.md` 是用户可直接复用、可在任务详情和素材库中定位的脚本文案产物。

## 5.3 `video_scoring` 输入契约

```typescript
type AdVideoScoringCategory = 'brand' | 'performance' | 'creative';

interface VideoScoringInput {
  sourceVideoPath: string; // 本地视频绝对路径
  category: AdVideoScoringCategory; // 手动选择广告类型
}
```

`video_scoring` 不做自动分类、不做跨类型比较，本期只支持单条本地视频评分。结果契约如下：

```typescript
interface VideoScoringResult {
  category: AdVideoScoringCategory;
  compliancePass: boolean;
  complianceIssues: string[];
  dimensionScores: Record<string, number>; // 按类型动态变化，可为空对象
  evidence: Record<string, string>;
  analysis: string;
  suggestions: string[];
  bgmAnalysis?: {
    available: boolean;
    summary: string;
    sampleRate?: number;
    durationSec?: number;
    frameCount?: number;
    energyLevel?: 'low' | 'medium' | 'high';
    brightness?: 'dark' | 'balanced' | 'bright';
    dynamics?: 'stable' | 'dynamic' | 'high_dynamic';
    metrics?: Record<string, { mean: number; min: number; max: number }>;
  };
}
```

- `dimensionScores` 的轴名和数量按广告类型动态变化，不生成跨类型总分，也不做统一归一化。
- `bgmAnalysis` 为本地音轨分析结果，主要作为广告节奏、情绪和音乐匹配度的辅助判断依据；即使本地分析不可用，也不影响任务成功。
- 若合规不通过，任务仍可成功返回 `score.json` 与 `report.md`；此时必须至少返回 `category`、`compliancePass=false`、`complianceIssues`、`analysis`、`suggestions`，并允许 `dimensionScores` 为空对象。

## 5.4 `ecommerce_image` 输入契约

```typescript
type EcommerceImageStyle = 'clean' | 'premium' | 'promotion' | 'lifestyle';

interface EcommerceImageInput {
  productImagePath: string; // 本地商品主图绝对路径，支持 png/jpg/jpeg/webp/bmp
  productName?: string; // <= 100
  sellingPoints?: string; // <= 1000，商品卖点、目标人群、禁用表达等补充信息
  fixedCopy?: string; // <= 120，可选固定套路文案，如“快来抖音购物”
  scenePrompt?: string; // <= 500，可选背景替换场景，如“清晨浴室台面”
  variantCount: number; // 1..5
  style: EcommerceImageStyle; // clean:干净主图；premium:高级质感；promotion:促销转化；lifestyle:生活场景
}
```

`ecommerce_image` 默认通过 `ModelClient.generateImage` 承接 Seedream 图生图能力。当前 Electron 版本不在本地部署主体检测、抠图、OCR 或牛皮癣分割模型；商品主体、牛皮癣识别、主图美化、背景替换和文案渲染均通过云端模型与结构化 Prompt 完成，本地只负责输入校验、步骤编排、渲染计划、产物记录和素材入库。

### 5.4.1 `ecommerce_image` 产物质量契约

- `render_plan.json` 由 `copy_render` 在最终图片生成前写入，必须包含 `headline`、`subHeadline`、`badges`、`emphasizedKeywords`、`colorStrategy`、`layoutConstraints` 和与背景变体一一对应的 `items`。
- `render_plan.json.items[]` 至少记录 `variantIndex`、`sourceBackgroundPath`、`scene`、`style`、`textPlacement`、`readabilityRules`、`forbiddenRegions` 和该变体最终渲染约束。
- `finals.json.finals[]` 必须保留可追溯质量元信息，至少包含 `index`、`status`、`path`、`sourceBackgroundPath`、`prompt`、`headline`、`subHeadline`、`badges`、`emphasizedKeywords`、`riskNotes`、`qualityNotes`。
- 单张最终图生成失败时，错误信息必须包含失败的变体 `index`；失败后的任务暂停/失败行为沿用现有 Pipeline runner。
- 中间图片素材和最终图片素材都登记为 `image`，通过 tags 区分 `beautified`、`background`、`final`，便于素材库定位问题来源。


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
