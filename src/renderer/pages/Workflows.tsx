import { Button, Empty, Input, Select, Space, Tag, Typography, message } from 'antd';
import { DownOutlined, ReloadOutlined, SaveOutlined } from '@ant-design/icons';
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import { useEffect, useMemo, useState } from 'react';

import { useSettingsStore } from '../stores/settings-store.js';
import {
  WORKFLOW_DEFINITIONS,
  WORKFLOW_PROMPT_DEFINITIONS,
  WORKFLOW_PROMPT_TEMPLATE_VERSION,
  getDefaultWorkflowPrompts,
} from '../../shared/workflows.js';
import type { TaskType } from '../../shared/types.js';
import type { WorkflowNodeDefinition, WorkflowPromptId } from '../../shared/workflows.js';
import '@xyflow/react/dist/style.css';

const WORKFLOW_OPTIONS: Array<{ value: TaskType; label: string }> = [
  { value: 'explosion', label: '广告爆款裂变' },
  { value: 'native', label: '原生爆款素材' },
  { value: 'copywriting', label: '广告文案脚本' },
  { value: 'pretrailer', label: '广告前贴' },
  { value: 'avatar', label: '数字人口播广告' },
];

type WorkflowNodeStage = 'input' | 'logic' | 'model' | 'media' | 'quality' | 'output';

interface WorkflowFlowNodeData extends Record<string, unknown> {
  index: number;
  title: string;
  description: string;
  artifact: string;
  promptCount: number;
  stage: WorkflowNodeStage;
  isFirst: boolean;
  isLast: boolean;
  sourcePosition: Position;
  targetPosition: Position;
}

type WorkflowFlowNode = Node<WorkflowFlowNodeData, 'workflowNode'>;
type WorkflowFlowEdge = Edge<Record<string, never>, 'smoothstep'>;

const WORKFLOW_STAGE_LABELS: Record<WorkflowNodeStage, string> = {
  input: '输入',
  logic: '逻辑',
  model: '模型',
  media: '媒体',
  quality: '质检',
  output: '成片',
};

function findFirstPromptNode(nodes: WorkflowNodeDefinition[]): WorkflowNodeDefinition {
  return nodes.find((node) => node.promptIds.length > 0) ?? nodes[0] ?? {
    id: 'empty',
    title: '暂无节点',
    description: '',
    artifact: '',
    promptIds: [],
  };
}

function getWorkflowNodeStage(
  node: WorkflowNodeDefinition,
  index: number,
  total: number,
): WorkflowNodeStage {
  if (index === 0) return 'input';
  if (index === total - 1) return 'output';
  if (
    node.id.includes('compliance') ||
    node.id.includes('checker') ||
    node.id.includes('validate')
  ) {
    return 'quality';
  }
  if (
    node.artifact.includes('.mp4') ||
    node.artifact.includes('.m4a') ||
    node.id.includes('seedance') ||
    node.id.includes('audio') ||
    node.id.includes('tts') ||
    node.id.includes('asset') ||
    node.id.includes('overlay') ||
    node.id.includes('concat') ||
    node.id.includes('mux')
  ) {
    return 'media';
  }
  if (node.promptIds.length > 0) return 'model';
  return 'logic';
}

function getNodeLayout(
  index: number,
  total: number,
): { x: number; y: number; sourcePosition: Position; targetPosition: Position } {
  const columnCount = Math.min(3, total);
  const rowIndex = Math.floor(index / columnCount);
  const columnIndex = index % columnCount;
  const isReversedRow = rowIndex % 2 === 1;
  const visualColumn = isReversedRow ? columnCount - 1 - columnIndex : columnIndex;
  const hasNextNode = index < total - 1;
  const isTurnNode = hasNextNode && columnIndex === columnCount - 1;
  const isFirstNodeAfterTurn = rowIndex > 0 && columnIndex === 0;

  return {
    x: visualColumn * 258,
    y: 66 + rowIndex * 184,
    sourcePosition: isTurnNode ? Position.Bottom : isReversedRow ? Position.Left : Position.Right,
    targetPosition: isFirstNodeAfterTurn ? Position.Top : isReversedRow ? Position.Right : Position.Left,
  };
}

function buildWorkflowNodes(
  nodes: WorkflowNodeDefinition[],
  selectedNodeId: string,
): WorkflowFlowNode[] {
  return nodes.map((node, index) => {
    const layout = getNodeLayout(index, nodes.length);
    return {
      id: node.id,
      type: 'workflowNode',
      position: { x: layout.x, y: layout.y },
      sourcePosition: layout.sourcePosition,
      targetPosition: layout.targetPosition,
      selected: node.id === selectedNodeId,
      draggable: true,
      connectable: false,
      ariaRole: 'button',
      ariaLabel: `${node.title}，${node.description}`,
      data: {
        index: index + 1,
        title: node.title,
        description: node.description,
        artifact: node.artifact,
        promptCount: node.promptIds.length,
        stage: getWorkflowNodeStage(node, index, nodes.length),
        isFirst: index === 0,
        isLast: index === nodes.length - 1,
        sourcePosition: layout.sourcePosition,
        targetPosition: layout.targetPosition,
      },
    };
  });
}

function buildWorkflowEdges(nodes: WorkflowNodeDefinition[]): WorkflowFlowEdge[] {
  const edges: WorkflowFlowEdge[] = [];
  for (let index = 1; index < nodes.length; index += 1) {
    const source = nodes[index - 1];
    const target = nodes[index];
    if (!source || !target) continue;
    edges.push({
      id: `${source.id}-${target.id}`,
      source: source.id,
      target: target.id,
      type: 'smoothstep',
      selectable: false,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 16,
        height: 16,
        color: 'var(--workflow-edge)',
      },
      style: {
        stroke: 'var(--workflow-edge)',
        strokeWidth: 1.7,
      },
      data: {},
    });
  }
  return edges;
}

function getPromptCount(nodes: WorkflowNodeDefinition[]): number {
  return nodes.reduce((total, node) => total + node.promptIds.length, 0);
}

function WorkflowFlowNodeCard({ data, selected }: NodeProps<WorkflowFlowNode>) {
  const stageClassName = `stage-${data.stage}`;
  return (
    <div className={`workflow-flow-node ${stageClassName} ${selected ? 'selected' : ''}`}>
      {!data.isFirst ? (
        <Handle
          type="target"
          position={data.targetPosition}
          isConnectable={false}
          className={`workflow-flow-handle target position-${data.targetPosition}`}
        />
      ) : null}
      <div className="workflow-flow-node-topline">
        <span className="workflow-flow-node-index">{String(data.index).padStart(2, '0')}</span>
        <span className={`workflow-stage-pill ${stageClassName}`}>{WORKFLOW_STAGE_LABELS[data.stage]}</span>
      </div>
      <strong>{data.title}</strong>
      <span className="workflow-flow-node-description">{data.description}</span>
      <div className="workflow-flow-node-footer">
        <code>{data.artifact}</code>
        <span>{data.promptCount > 0 ? `${data.promptCount} Prompt` : '固定'}</span>
      </div>
      {!data.isLast ? (
        <Handle
          type="source"
          position={data.sourcePosition}
          isConnectable={false}
          className={`workflow-flow-handle source position-${data.sourcePosition}`}
        />
      ) : null}
    </div>
  );
}

const NODE_TYPES = {
  workflowNode: WorkflowFlowNodeCard,
};

export function Workflows() {
  const { settings, loadSettings, saveSettings } = useSettingsStore();
  const [workflowType, setWorkflowType] = useState<TaskType>('explosion');
  const [selectedNodeId, setSelectedNodeId] = useState<string>('script_parse');
  const [selectedPromptId, setSelectedPromptId] = useState<WorkflowPromptId>('explosion.script_parse');
  const [draft, setDraft] = useState('');
  const [isCompactFlow, setIsCompactFlow] = useState(false);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    const query = window.matchMedia('(max-width: 640px)');
    const syncCompactFlow = () => setIsCompactFlow(query.matches);
    syncCompactFlow();
    query.addEventListener('change', syncCompactFlow);
    return () => query.removeEventListener('change', syncCompactFlow);
  }, []);

  const workflow = WORKFLOW_DEFINITIONS[workflowType];
  const selectedNode = useMemo(() => {
    return workflow.nodes.find((node) => node.id === selectedNodeId) ?? findFirstPromptNode(workflow.nodes);
  }, [selectedNodeId, workflow.nodes]);

  const promptOptions = selectedNode.promptIds.map((id) => ({
    value: id,
    label: WORKFLOW_PROMPT_DEFINITIONS[id].title,
  }));
  const flowNodes = useMemo(
    () => buildWorkflowNodes(workflow.nodes, selectedNode.id),
    [selectedNode.id, workflow.nodes],
  );
  const flowEdges = useMemo(() => buildWorkflowEdges(workflow.nodes), [workflow.nodes]);
  const defaultViewport = useMemo(
    () => (isCompactFlow ? { x: 14, y: 58, zoom: 0.56 } : { x: 34, y: 54, zoom: 0.88 }),
    [isCompactFlow],
  );
  const selectedStage = getWorkflowNodeStage(
    selectedNode,
    workflow.nodes.findIndex((node) => node.id === selectedNode.id),
    workflow.nodes.length,
  );
  const selectedStageClassName = `stage-${selectedStage}`;

  useEffect(() => {
    const firstNode = findFirstPromptNode(WORKFLOW_DEFINITIONS[workflowType].nodes);
    setSelectedNodeId(firstNode.id);
    if (firstNode.promptIds[0]) {
      setSelectedPromptId(firstNode.promptIds[0]);
    }
  }, [workflowType]);

  useEffect(() => {
    if (!selectedNode.promptIds.includes(selectedPromptId) && selectedNode.promptIds[0]) {
      setSelectedPromptId(selectedNode.promptIds[0]);
    }
  }, [selectedNode, selectedPromptId]);

  useEffect(() => {
    const defaults = getDefaultWorkflowPrompts();
    const value = settings?.workflowPrompts[selectedPromptId] ?? defaults[selectedPromptId] ?? '';
    setDraft(value);
  }, [selectedPromptId, settings]);

  async function savePrompt() {
    await saveSettings({
      workflowPrompts: {
        ...settings?.workflowPrompts,
        [selectedPromptId]: draft,
      },
    });
    void message.success('Prompt 已保存');
  }

  async function resetPrompt() {
    const defaults = getDefaultWorkflowPrompts();
    const value = defaults[selectedPromptId];
    setDraft(value);
    await saveSettings({
      workflowPrompts: {
        ...settings?.workflowPrompts,
        [selectedPromptId]: value,
      },
    });
    void message.success('已恢复默认 Prompt');
  }

  const promptDefinition = WORKFLOW_PROMPT_DEFINITIONS[selectedPromptId];

  return (
    <section className="section workflow-page">
      <div className="workflow-studio-header">
        <div>
          <span className="workflow-kicker">DAG Studio</span>
          <Typography.Title level={4}>工作流可视化编排</Typography.Title>
          <span>用广告视频制作画布查看节点依赖，并调整模型节点的默认 Prompt。</span>
        </div>
        <Select<TaskType>
          value={workflowType}
          options={WORKFLOW_OPTIONS}
          className="workflow-select"
          classNames={{ popup: { root: 'workflow-select-popup' } }}
          placement="bottomRight"
          suffixIcon={<DownOutlined className="workflow-select-chevron" />}
          aria-label="选择工作流类型"
          onChange={setWorkflowType}
        />
      </div>

      <div className="workflow-studio">
        <section className="workflow-canvas-shell" aria-label={`${workflow.title} 工作流画布`}>
          <div className="workflow-canvas-toolbar">
            <div>
              <Typography.Title level={5}>{workflow.title}</Typography.Title>
              <span>{workflow.description}</span>
            </div>
            <div className="workflow-canvas-stats" aria-label="工作流概览">
              <span>{workflow.nodes.length} 节点</span>
              <span>{getPromptCount(workflow.nodes)} Prompt</span>
              <span>{WORKFLOW_PROMPT_TEMPLATE_VERSION}</span>
            </div>
          </div>

          <div className="workflow-flow-frame">
            <ReactFlow<WorkflowFlowNode, WorkflowFlowEdge>
              key={`${workflowType}-${isCompactFlow ? 'compact' : 'wide'}`}
              nodes={flowNodes}
              edges={flowEdges}
              nodeTypes={NODE_TYPES}
              defaultViewport={defaultViewport}
              minZoom={0.5}
              maxZoom={1.35}
              nodesConnectable={false}
              edgesFocusable={false}
              panOnScroll
              proOptions={{ hideAttribution: true }}
              onNodeClick={(_event, node) => {
                setSelectedNodeId(node.id);
                const workflowNode = workflow.nodes.find((item) => item.id === node.id);
                if (workflowNode?.promptIds[0]) {
                  setSelectedPromptId(workflowNode.promptIds[0]);
                }
              }}
            >
              <Background gap={28} size={1.1} color="var(--workflow-grid-dot)" />
              <MiniMap
                pannable
                zoomable
                className="workflow-minimap"
                nodeClassName={(node) => {
                  const stage = (node.data as WorkflowFlowNodeData).stage;
                  return `workflow-minimap-node stage-${stage}`;
                }}
              />
              <Controls className="workflow-controls" showInteractive={false} />
            </ReactFlow>
          </div>
        </section>

        <aside className="workflow-inspector" aria-label="节点检查器">
          <div className="workflow-inspector-head">
            <span className={`workflow-stage-pill ${selectedStageClassName}`}>
              {WORKFLOW_STAGE_LABELS[selectedStage]}
            </span>
            <Typography.Title level={5}>{selectedNode.title}</Typography.Title>
            <span>{selectedNode.description}</span>
          </div>

          <dl className="workflow-node-facts">
            <div>
              <dt>产物</dt>
              <dd>{selectedNode.artifact}</dd>
            </div>
            <div>
              <dt>Prompt</dt>
              <dd>{selectedNode.promptIds.length > 0 ? `${selectedNode.promptIds.length} 个可编辑` : '固定处理'}</dd>
            </div>
            <div>
              <dt>模板</dt>
              <dd>{WORKFLOW_PROMPT_TEMPLATE_VERSION}</dd>
            </div>
          </dl>

          <div className="workflow-node-strip" aria-label="节点快捷选择">
            {workflow.nodes.map((node, index) => (
              <button
                key={node.id}
                type="button"
                className={`workflow-strip-node ${node.id === selectedNode.id ? 'selected' : ''}`}
                aria-pressed={node.id === selectedNode.id}
                aria-label={`${node.title}，${node.description}`}
                onClick={() => {
                  setSelectedNodeId(node.id);
                  if (node.promptIds[0]) {
                    setSelectedPromptId(node.promptIds[0]);
                  }
                }}
              >
                {index + 1}
              </button>
            ))}
          </div>

          {selectedNode.promptIds.length === 0 ? (
            <div className="workflow-empty-prompt">
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="该节点没有模型 Prompt" />
              <span>这类步骤由本地文件处理、FFmpeg、队列或固定逻辑完成。</span>
            </div>
          ) : (
            <Space direction="vertical" size={12} className="full-width">
              <Select<WorkflowPromptId>
                value={selectedPromptId}
                options={promptOptions}
                aria-label="选择 Prompt"
                onChange={setSelectedPromptId}
              />
              <div className="prompt-meta">
                <div>
                  <strong>{promptDefinition.title}</strong>
                  <span>{promptDefinition.description}</span>
                </div>
                <Tag className="prompt-tag editable">Prompt 可调</Tag>
                <div className="prompt-context-tags" aria-label="Prompt 工程能力">
                  <Tag className="prompt-tag">内部分析</Tag>
                  <Tag className="prompt-tag">Seedance Router</Tag>
                  <Tag className="prompt-tag">参考策略</Tag>
                  <Tag className="prompt-tag">质量 Rubric</Tag>
                </div>
                {promptDefinition.variables.length > 0 ? (
                  <div className="prompt-vars">
                    {promptDefinition.variables.map((variable) => (
                      <code key={variable}>{`{${variable}}`}</code>
                    ))}
                  </div>
                ) : null}
              </div>
              <Input.TextArea
                value={draft}
                rows={13}
                aria-label={`${promptDefinition.title} Prompt 内容`}
                className="prompt-editor"
                onChange={(event) => setDraft(event.target.value)}
              />
              <div className="workflow-editor-actions">
                <Button icon={<ReloadOutlined />} className="secondary-button" onClick={() => void resetPrompt()}>
                  恢复默认
                </Button>
                <Button type="primary" icon={<SaveOutlined />} className="primary-action" onClick={() => void savePrompt()}>
                  保存 Prompt
                </Button>
              </div>
            </Space>
          )}
        </aside>
      </div>
    </section>
  );
}
