import { useEffect, useState } from 'react';
import { App, Button, Empty, Modal, Popconfirm, Progress, Space, Table, Tag, Tooltip, Typography } from 'antd';
import {
  CheckCircleOutlined,
  CopyOutlined,
  DeleteOutlined,
  ExportOutlined,
  EyeOutlined,
  FolderOpenOutlined,
  ReloadOutlined,
  StopOutlined,
} from '@ant-design/icons';

import { api } from '../ipc.js';
import { useTasksStore } from '../stores/tasks-store.js';
import type { StepStatus, TaskRecord, TaskStep, TaskType } from '../../shared/types.js';

const TASK_TYPE_LABEL: Record<TaskType, string> = {
  explosion: '爆款裂变',
  pretrailer: '广告前贴',
  avatar: '数字人口播',
  native: '原生爆款',
};

const TASK_STATUS_LABEL: Record<TaskRecord['status'], string> = {
  queued: '排队',
  running: '运行',
  success: '完成',
  failed: '失败',
  paused: '暂停',
  canceled: '取消',
  waiting_confirmation: '待确认',
};

const STEP_STATUS_LABEL: Record<StepStatus, string> = {
  pending: '等待',
  running: '运行',
  success: '完成',
  failed: '失败',
  skipped: '跳过',
  canceled: '取消',
  waiting_confirmation: '待确认',
};

const STEP_LABELS: Record<TaskType, Record<string, string>> = {
  explosion: {
    download: '素材导入',
    asr: '语音识别',
    script_parse: '脚本解析',
    rewrite: '裂变改写',
    script_confirm: '脚本文案确认',
    video_prompt_optimize: '视频提示词优化',
    seedance: '视频生成',
    audio_replace: '音频替换',
  },
  pretrailer: {
    ingest: '素材导入',
    understand: '视频理解',
    copy_gen: '前贴文案',
    script_gen: '口播脚本',
    script_confirm: '脚本文案确认',
    video_prompt_optimize: '视频提示词优化',
    seedance: '前贴生成',
    tts: '语音合成',
    mux_pretrailer: '前贴合成',
    concat: '成片拼接',
  },
  avatar: {
    validate_avatar: '数字人校验',
    product_understand: '商品理解',
    brand_parse: '品牌解析',
    script_gen: '口播脚本',
    script_confirm: '脚本文案确认',
    tts: '语音合成',
    video_prompt_optimize: '视频提示词优化',
    seedance_avatar: '数字人生成',
    overlay: '素材叠加',
    postprocess: '成片处理',
  },
  native: {
    industry_router: '行业路由',
    concept_planner: '概念规划',
    script_writer: '脚本生成',
    script_confirm: '脚本文案确认',
    storyboard_builder: '分镜构建',
    compliance_pre: '前置合规',
    video_prompt_optimize: '视频提示词优化',
    asset_generator: '素材生成',
    consistency_checker: '一致性检测',
    composer: '成片入库',
  },
};

interface TaskTableProps {
  tasks: TaskRecord[];
  pageSize?: number;
  emptyDescription?: string;
}

interface StepRow extends TaskStep {
  index: number;
}

interface ArtifactPreview {
  path: string;
  title: string;
  content: string;
  truncated: boolean;
}

const PREVIEWABLE_EXTENSIONS = new Set(['csv', 'json', 'log', 'md', 'srt', 'txt', 'vtt']);

function formatTime(value?: number): string {
  if (value === undefined) {
    return '未开始';
  }
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(value);
}

function getStepLabel(taskType: TaskType, step: string): string {
  return STEP_LABELS[taskType][step] ?? step;
}

function getFileName(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

function getExtension(path: string): string {
  const fileName = getFileName(path);
  const index = fileName.lastIndexOf('.');
  return index > -1 ? fileName.slice(index + 1).toLowerCase() : '';
}

function isPreviewable(path: string): boolean {
  return PREVIEWABLE_EXTENSIONS.has(getExtension(path));
}

function extractLogPath(logs?: string): string | undefined {
  return /日志文件：([^\n]+)/u.exec(logs ?? '')?.[1]?.trim();
}

function extractCodexDiagnosisPath(logs?: string): string | undefined {
  return /Codex诊断文件：([^\n]+)/u.exec(logs ?? '')?.[1]?.trim();
}

function formatTaskInput(task: TaskRecord): string {
  return JSON.stringify(task.input, null, 2);
}

function findWaitingScriptStep(task: TaskRecord): TaskStep | undefined {
  return (
    task.steps.find((step) => step.step === 'script_confirm' && step.status === 'waiting_confirmation') ??
    task.steps.find((step) => step.status === 'waiting_confirmation')
  );
}

function TaskStatusCell({ task }: { task: TaskRecord }) {
  return (
    <div className="task-status-cell">
      <Tag className={`status-tag ${task.status}`}>{TASK_STATUS_LABEL[task.status]}</Tag>
      {task.error ? (
        <Typography.Text className="task-error" ellipsis={{ tooltip: task.error }}>
          {task.error}
        </Typography.Text>
      ) : null}
    </div>
  );
}

function StepOutput({ step }: { step: TaskStep }) {
  const { message } = App.useApp();
  const [preview, setPreview] = useState<ArtifactPreview>();
  const [previewLoading, setPreviewLoading] = useState(false);
  const logPath = extractLogPath(step.logs);
  const codexDiagnosisPath = extractCodexDiagnosisPath(step.logs);

  if (!step.artifactPath && !step.logs) {
    return <span className="muted-text">等待输出</span>;
  }

  const openArtifact = async () => {
    if (!step.artifactPath) {
      return;
    }
    try {
      await api.asset.open({ path: step.artifactPath });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      void message.error(detail);
    }
  };

  const revealArtifact = async () => {
    if (!step.artifactPath) {
      return;
    }
    try {
      await api.asset.reveal({ path: step.artifactPath });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      void message.error(detail);
    }
  };

  const previewArtifact = async () => {
    if (!step.artifactPath) {
      return;
    }
    setPreviewLoading(true);
    try {
      const result = await api.asset.readText({ path: step.artifactPath });
      setPreview({
        path: result.path,
        title: getFileName(result.path),
        content: result.content,
        truncated: result.truncated,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      void message.error(detail);
    } finally {
      setPreviewLoading(false);
    }
  };

  const revealLog = async () => {
    if (!logPath) {
      return;
    }
    try {
      await api.asset.reveal({ path: logPath });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      void message.error(detail);
    }
  };

  const revealCodexDiagnosis = async () => {
    if (!codexDiagnosisPath) {
      return;
    }
    try {
      await api.asset.reveal({ path: codexDiagnosisPath });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      void message.error(detail);
    }
  };

  const previewLog = async () => {
    if (!logPath) {
      return;
    }
    setPreviewLoading(true);
    try {
      const result = await api.asset.readText({ path: logPath, maxBytes: 1024 * 1024 });
      setPreview({
        path: result.path,
        title: getFileName(result.path),
        content: result.content,
        truncated: result.truncated,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      void message.error(detail);
    } finally {
      setPreviewLoading(false);
    }
  };

  const previewCodexDiagnosis = async () => {
    if (!codexDiagnosisPath) {
      return;
    }
    setPreviewLoading(true);
    try {
      const result = await api.asset.readText({ path: codexDiagnosisPath, maxBytes: 1024 * 1024 });
      setPreview({
        path: result.path,
        title: getFileName(result.path),
        content: result.content,
        truncated: result.truncated,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      void message.error(detail);
    } finally {
      setPreviewLoading(false);
    }
  };

  const openPreviewFile = async () => {
    if (!preview) {
      return;
    }
    try {
      await api.asset.open({ path: preview.path });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      void message.error(detail);
    }
  };

  return (
    <div className="step-output">
      {step.artifactPath ? (
        <Space size={8} wrap>
          <Typography.Text className="artifact-name" ellipsis={{ tooltip: step.artifactPath }}>
            {getFileName(step.artifactPath)}
          </Typography.Text>
          {isPreviewable(step.artifactPath) ? (
            <Tooltip title="预览节点输出">
              <Button
                size="small"
                className="secondary-button icon-button"
                icon={<EyeOutlined />}
                aria-label="预览节点输出"
                loading={previewLoading}
                onClick={() => void previewArtifact()}
              />
            </Tooltip>
          ) : null}
          <Tooltip title="打开产物">
            <Button
              size="small"
              className="secondary-button icon-button"
              icon={<ExportOutlined />}
              aria-label="打开产物"
              onClick={() => void openArtifact()}
            />
          </Tooltip>
          <Tooltip title="在文件管理器中定位">
            <Button
              size="small"
              className="secondary-button icon-button"
              icon={<FolderOpenOutlined />}
              aria-label="在文件管理器中定位"
              onClick={() => void revealArtifact()}
            />
          </Tooltip>
        </Space>
      ) : null}
      {step.logs ? (
        <Typography.Text className="step-log" ellipsis={{ tooltip: step.logs }}>
          {step.logs}
        </Typography.Text>
      ) : null}
      {logPath ? (
        <Space size={8} wrap>
          <Tooltip title="查看详细日志">
            <Button
              size="small"
              className="secondary-button icon-button"
              icon={<EyeOutlined />}
              aria-label="查看详细日志"
              loading={previewLoading}
              onClick={() => void previewLog()}
            />
          </Tooltip>
          <Tooltip title="定位日志文件">
            <Button
              size="small"
              className="secondary-button icon-button"
              icon={<FolderOpenOutlined />}
              aria-label="定位日志文件"
              onClick={() => void revealLog()}
            />
          </Tooltip>
        </Space>
      ) : null}
      {codexDiagnosisPath ? (
        <Space size={8} wrap>
          <Tooltip title="查看 Codex 诊断">
            <Button
              size="small"
              className="secondary-button icon-button"
              icon={<EyeOutlined />}
              aria-label="查看 Codex 诊断"
              loading={previewLoading}
              onClick={() => void previewCodexDiagnosis()}
            />
          </Tooltip>
          <Tooltip title="定位 Codex 诊断文件">
            <Button
              size="small"
              className="secondary-button icon-button"
              icon={<FolderOpenOutlined />}
              aria-label="定位 Codex 诊断文件"
              onClick={() => void revealCodexDiagnosis()}
            />
          </Tooltip>
        </Space>
      ) : null}
      <Modal
        title={preview?.title ?? '节点输出'}
        open={preview !== undefined}
        width={860}
        onCancel={() => setPreview(undefined)}
        footer={[
          <Button key="open" onClick={() => void openPreviewFile()}>
            打开文件
          </Button>,
          <Button key="close" type="primary" onClick={() => setPreview(undefined)}>
            关闭
          </Button>,
        ]}
      >
        {preview ? (
          <div className="artifact-preview-wrap">
            <Typography.Text className="artifact-preview-path" ellipsis={{ tooltip: preview.path }}>
              {preview.path}
            </Typography.Text>
            {preview.truncated ? (
              <Typography.Text className="artifact-preview-note">
                文件较大，仅展示前 512KB 内容。
              </Typography.Text>
            ) : null}
            <pre className="artifact-preview">{preview.content}</pre>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

function ScriptConfirmationPanel({
  task,
  step,
  onConfirm,
}: {
  task: TaskRecord;
  step: TaskStep;
  onConfirm(): Promise<void>;
}) {
  const { message } = App.useApp();
  const [content, setContent] = useState<string>();
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    let alive = true;
    setContent(undefined);
    setTruncated(false);
    if (!step.artifactPath || !isPreviewable(step.artifactPath)) {
      return () => {
        alive = false;
      };
    }

    setLoading(true);
    void api.asset
      .readText({ path: step.artifactPath, maxBytes: 1024 * 1024 })
      .then((result) => {
        if (!alive) {
          return;
        }
        setContent(result.content);
        setTruncated(result.truncated);
      })
      .catch((error) => {
        const detail = error instanceof Error ? error.message : String(error);
        void message.error(detail);
      })
      .finally(() => {
        if (alive) {
          setLoading(false);
        }
      });

    return () => {
      alive = false;
    };
  }, [message, step.artifactPath]);

  const confirm = async () => {
    setConfirming(true);
    try {
      await onConfirm();
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div className="script-confirm-panel">
      <div className="script-confirm-header">
        <div>
          <Typography.Text strong>脚本文案待确认</Typography.Text>
          <span>
            {TASK_TYPE_LABEL[task.type]} · {getStepLabel(task.type, step.step)}
          </span>
        </div>
        <Button
          type="primary"
          icon={<CheckCircleOutlined />}
          loading={confirming}
          onClick={() => void confirm()}
        >
          确认脚本文案并继续
        </Button>
      </div>
      {step.logs ? <Typography.Text className="step-log">{step.logs}</Typography.Text> : null}
      {step.artifactPath ? (
        <Typography.Text className="artifact-preview-path" ellipsis={{ tooltip: step.artifactPath }}>
          {step.artifactPath}
        </Typography.Text>
      ) : null}
      {loading ? (
        <div className="script-preview-empty">正在读取脚本文案...</div>
      ) : content ? (
        <>
          {truncated ? (
            <Typography.Text className="artifact-preview-note">
              文件较大，仅展示前 1MB 内容。
            </Typography.Text>
          ) : null}
          <pre className="script-confirm-preview">{content}</pre>
        </>
      ) : (
        <div className="script-preview-empty">脚本文案产物尚未写入或不可预览。</div>
      )}
    </div>
  );
}

function WorkflowSteps({
  task,
  onRetryStep,
  onConfirmScript,
}: {
  task: TaskRecord;
  onRetryStep(stepId: string): void;
  onConfirmScript(): Promise<void>;
}) {
  const rows: StepRow[] = task.steps.map((step, index) => ({ ...step, index: index + 1 }));
  const waitingScriptStep = task.status === 'waiting_confirmation' ? findWaitingScriptStep(task) : undefined;

  if (rows.length === 0) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无节点" />;
  }

  return (
    <div className="workflow-steps">
      <div className="workflow-heading">
        <Typography.Text strong>中间过程输出节点</Typography.Text>
        <span>默认隐藏，展开任务后查看每一步的状态、产物和日志。</span>
      </div>
      {waitingScriptStep ? (
        <ScriptConfirmationPanel task={task} step={waitingScriptStep} onConfirm={onConfirmScript} />
      ) : null}
      <div className="workflow-input">
        <div className="workflow-input-heading">
          <Typography.Text strong>工作流输入</Typography.Text>
          <Typography.Text>{TASK_TYPE_LABEL[task.type]}</Typography.Text>
        </div>
        <pre>{formatTaskInput(task)}</pre>
      </div>
      <Table<StepRow>
        rowKey="id"
        size="small"
        pagination={false}
        dataSource={rows}
        className="desktop-table step-table"
        columns={[
          {
            title: '节点',
            width: 220,
            render: (_, step) => (
              <div className="step-name">
                <span className="step-index">{step.index}</span>
                <div>
                  <strong>{getStepLabel(task.type, step.step)}</strong>
                  <span>{step.step}</span>
                </div>
              </div>
            ),
          },
          {
            title: '状态',
            width: 92,
            render: (_, step) => (
              <Tag className={`status-tag ${step.status}`}>{STEP_STATUS_LABEL[step.status]}</Tag>
            ),
          },
          {
            title: '输出',
            render: (_, step) => <StepOutput step={step} />,
          },
          {
            title: '时间',
            width: 150,
            render: (_, step) => (
              <div className="step-time">
                <span>{formatTime(step.startedAt)}</span>
                <span>{formatTime(step.finishedAt)}</span>
              </div>
            ),
          },
          {
            title: '操作',
            width: 104,
            render: (_, step) => (
              <Tooltip title="从该节点重新执行后续流程">
                <Button
                  size="small"
                  className="secondary-button icon-button"
                  icon={<ReloadOutlined />}
                  aria-label={`从${getStepLabel(task.type, step.step)}重新执行后续流程`}
                  disabled={task.status === 'running' || task.status === 'queued'}
                  onClick={() => onRetryStep(step.id)}
                />
              </Tooltip>
            ),
          },
        ]}
      />
    </div>
  );
}

export function TaskTable({ tasks, pageSize = 8, emptyDescription = '暂无任务' }: TaskTableProps) {
  const { message } = App.useApp();
  const { retryTask, retryStep, confirmScript, cancelTask, deleteTask, cloneTask } = useTasksStore();

  const runTaskAction = async (action: () => Promise<void>, successText: string) => {
    try {
      await action();
      void message.success(successText);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      void message.error(detail);
    }
  };

  return (
    <Table<TaskRecord>
      rowKey="id"
      className="desktop-table"
      size="small"
      dataSource={tasks}
      scroll={{ x: 720 }}
      pagination={{ pageSize }}
      expandable={{
        rowExpandable: (record) => record.steps.length > 0,
        expandedRowRender: (record) => (
          <WorkflowSteps
            task={record}
            onRetryStep={(stepId) => {
              void retryStep(record.id, stepId);
            }}
            onConfirmScript={() => runTaskAction(() => confirmScript(record.id), '脚本文案已确认')}
          />
        ),
      }}
      locale={{
        emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyDescription} />,
      }}
      columns={[
        {
          title: '类型',
          dataIndex: 'type',
          width: 160,
          render: (type: TaskType) => TASK_TYPE_LABEL[type],
        },
        {
          title: '状态',
          dataIndex: 'status',
          width: 130,
          render: (_, record) => <TaskStatusCell task={record} />,
        },
        {
          title: '进度',
          dataIndex: 'progress',
          width: 220,
          render: (value: number) => <Progress percent={value} size="small" />,
        },
        {
          title: '操作',
          width: 176,
          render: (_, record) => {
            const canRetry =
              record.status === 'paused' || record.status === 'failed' || record.status === 'canceled';
            const canConfirm = record.status === 'waiting_confirmation';
            const canCancel = record.status === 'queued' || record.status === 'running';
            const canDelete = record.status !== 'running';

            return (
              <Space size={6} wrap={false}>
                {canRetry ? (
                  <Tooltip title="重新执行任务">
                    <Button
                      size="small"
                      className="secondary-button icon-button"
                      icon={<ReloadOutlined />}
                      aria-label="重新执行任务"
                      onClick={() => void runTaskAction(() => retryTask(record.id), '任务已重新入队')}
                    />
                  </Tooltip>
                ) : null}
                {canConfirm ? (
                  <Tooltip title="确认脚本文案并继续">
                    <Button
                      size="small"
                      className="secondary-button icon-button"
                      icon={<CheckCircleOutlined />}
                      aria-label="确认脚本文案并继续"
                      onClick={() =>
                        void runTaskAction(() => confirmScript(record.id), '脚本文案已确认')
                      }
                    />
                  </Tooltip>
                ) : null}
                {canCancel ? (
                  <Popconfirm
                    title="取消任务"
                    description="已完成的节点会保留，后续节点不再执行。"
                    okText="取消任务"
                    cancelText="返回"
                    onConfirm={() =>
                      void runTaskAction(() => cancelTask(record.id), '任务已取消')
                    }
                  >
                    <Tooltip title="取消任务">
                      <Button
                        size="small"
                        className="secondary-button icon-button"
                        icon={<StopOutlined />}
                        aria-label="取消任务"
                      />
                    </Tooltip>
                  </Popconfirm>
                ) : null}
                <Tooltip title="克隆为新任务">
                  <Button
                    size="small"
                    className="secondary-button icon-button"
                    icon={<CopyOutlined />}
                    aria-label="克隆为新任务"
                    onClick={() => void runTaskAction(() => cloneTask(record.id), '任务已克隆')}
                  />
                </Tooltip>
                <Popconfirm
                  title="删除任务"
                  description="任务记录会删除，已入库素材仍保留在素材库。"
                  okText="删除"
                  cancelText="返回"
                  disabled={!canDelete}
                  onConfirm={() => void runTaskAction(() => deleteTask(record.id), '任务已删除')}
                >
                  <Tooltip title={canDelete ? '删除任务' : '运行中的任务请先取消'}>
                    <Button
                      danger
                      size="small"
                      className="icon-button"
                      icon={<DeleteOutlined />}
                      aria-label={canDelete ? '删除任务' : '运行中的任务请先取消'}
                      disabled={!canDelete}
                    />
                  </Tooltip>
                </Popconfirm>
              </Space>
            );
          },
        },
      ]}
    />
  );
}
