import { Button, Empty, Input, Select, Space, Tag, Typography, message } from 'antd';
import { ReloadOutlined, SaveOutlined } from '@ant-design/icons';
import { useEffect, useMemo, useState } from 'react';

import { useSettingsStore } from '../stores/settings-store.js';
import {
  WORKFLOW_DEFINITIONS,
  WORKFLOW_PROMPT_DEFINITIONS,
  getDefaultWorkflowPrompts,
} from '../../shared/workflows.js';
import type { TaskType } from '../../shared/types.js';
import type { WorkflowNodeDefinition, WorkflowPromptId } from '../../shared/workflows.js';

const WORKFLOW_OPTIONS: Array<{ value: TaskType; label: string }> = [
  { value: 'explosion', label: '广告爆款裂变' },
  { value: 'native', label: '原生爆款素材' },
  { value: 'pretrailer', label: '广告前贴' },
  { value: 'avatar', label: '数字人口播广告' },
];

function findFirstPromptNode(nodes: WorkflowNodeDefinition[]): WorkflowNodeDefinition {
  return nodes.find((node) => node.promptIds.length > 0) ?? nodes[0] ?? {
    id: 'empty',
    title: '暂无节点',
    description: '',
    artifact: '',
    promptIds: [],
  };
}

export function Workflows() {
  const { settings, loadSettings, saveSettings } = useSettingsStore();
  const [workflowType, setWorkflowType] = useState<TaskType>('explosion');
  const [selectedNodeId, setSelectedNodeId] = useState<string>('script_parse');
  const [selectedPromptId, setSelectedPromptId] = useState<WorkflowPromptId>('explosion.script_parse');
  const [draft, setDraft] = useState('');

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const workflow = WORKFLOW_DEFINITIONS[workflowType];
  const selectedNode = useMemo(() => {
    return workflow.nodes.find((node) => node.id === selectedNodeId) ?? findFirstPromptNode(workflow.nodes);
  }, [selectedNodeId, workflow.nodes]);

  const promptOptions = selectedNode.promptIds.map((id) => ({
    value: id,
    label: WORKFLOW_PROMPT_DEFINITIONS[id].title,
  }));

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
    <section className="section page-panel workflow-page">
      <div className="workflow-toolbar">
        <div className="form-header">
          <Typography.Title level={4}>工作流可视化</Typography.Title>
          <span>查看业务节点，并调整模型节点的默认 Prompt</span>
        </div>
        <Select<TaskType>
          value={workflowType}
          options={WORKFLOW_OPTIONS}
          className="workflow-select"
          onChange={setWorkflowType}
        />
      </div>

      <div className="workflow-layout">
        <section className="workflow-map" aria-label={`${workflow.title} 工作流`}>
          <div className="workflow-summary">
            <Typography.Title level={5}>{workflow.title}</Typography.Title>
            <span>{workflow.description}</span>
          </div>
          <div className="workflow-node-rail">
            {workflow.nodes.map((node, index) => (
              <button
                key={node.id}
                className={`workflow-node ${node.id === selectedNode.id ? 'selected' : ''}`}
                onClick={() => {
                  setSelectedNodeId(node.id);
                  if (node.promptIds[0]) {
                    setSelectedPromptId(node.promptIds[0]);
                  }
                }}
              >
                <span className="workflow-node-index">{index + 1}</span>
                <strong>{node.title}</strong>
                <span>{node.description}</span>
                <Tag className={node.promptIds.length > 0 ? 'prompt-tag editable' : 'prompt-tag'}>
                  {node.promptIds.length > 0 ? 'Prompt 可调' : '固定处理'}
                </Tag>
              </button>
            ))}
          </div>
        </section>

        <aside className="workflow-editor">
          <div className="workflow-editor-head">
            <div>
              <Typography.Title level={5}>{selectedNode.title}</Typography.Title>
              <span>{selectedNode.artifact}</span>
            </div>
          </div>

          {selectedNode.promptIds.length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="该节点没有模型 Prompt" />
          ) : (
            <Space direction="vertical" size={12} className="full-width">
              <Select<WorkflowPromptId>
                value={selectedPromptId}
                options={promptOptions}
                onChange={setSelectedPromptId}
              />
              <div className="prompt-meta">
                <strong>{promptDefinition.title}</strong>
                <span>{promptDefinition.description}</span>
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
                rows={14}
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
