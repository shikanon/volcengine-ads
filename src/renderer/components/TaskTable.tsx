import { App, Button, Empty, Popconfirm, Progress, Space, Table, Tag, Tooltip, Typography } from 'antd';
import {
  CopyOutlined,
  DeleteOutlined,
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
};

const STEP_STATUS_LABEL: Record<StepStatus, string> = {
  pending: '等待',
  running: '运行',
  success: '完成',
  failed: '失败',
  skipped: '跳过',
  canceled: '取消',
};

const STEP_LABELS: Record<TaskType, Record<string, string>> = {
  explosion: {
    download: '素材导入',
    frames: '关键帧抽取',
    asr: '语音识别',
    script_parse: '脚本解析',
    rewrite: '裂变改写',
    seedance: '视频生成',
    audio_replace: '音频替换',
  },
  pretrailer: {
    ingest: '素材导入',
    understand: '视频理解',
    keyframe_pick: '关键帧选择',
    copy_gen: '前贴文案',
    script_gen: '口播脚本',
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
    tts: '语音合成',
    seedance_avatar: '数字人生成',
    overlay: '素材叠加',
    postprocess: '成片处理',
  },
  native: {
    industry_router: '行业路由',
    concept_planner: '概念规划',
    script_writer: '脚本生成',
    storyboard_builder: '分镜构建',
    compliance_pre: '前置合规',
    asset_generator: '素材生成',
    consistency_checker: '一致性检测',
    composer: '成片入库',
  },
};

interface TaskTableProps {
  tasks: TaskRecord[];
  pageSize?: number;
}

interface StepRow extends TaskStep {
  index: number;
}

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

function StepOutput({ step }: { step: TaskStep }) {
  if (!step.artifactPath && !step.logs) {
    return <span className="muted-text">等待输出</span>;
  }

  return (
    <div className="step-output">
      {step.artifactPath ? (
        <Space size={8} wrap>
          <Typography.Text className="path-text" ellipsis={{ tooltip: step.artifactPath }}>
            {step.artifactPath}
          </Typography.Text>
          <Tooltip title="在文件管理器中定位">
            <Button
              size="small"
              className="secondary-button icon-button"
              icon={<FolderOpenOutlined />}
              onClick={() => void api.asset.reveal({ path: step.artifactPath ?? '' })}
            />
          </Tooltip>
        </Space>
      ) : null}
      {step.logs ? (
        <Typography.Text className="step-log" ellipsis={{ tooltip: step.logs }}>
          {step.logs}
        </Typography.Text>
      ) : null}
    </div>
  );
}

function WorkflowSteps({ task, onRetryStep }: { task: TaskRecord; onRetryStep(stepId: string): void }) {
  const rows: StepRow[] = task.steps.map((step, index) => ({ ...step, index: index + 1 }));

  if (rows.length === 0) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无节点" />;
  }

  return (
    <div className="workflow-steps">
      <div className="workflow-heading">
        <Typography.Text strong>中间过程输出节点</Typography.Text>
        <span>默认隐藏，展开任务后查看每一步的状态、产物和日志。</span>
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

export function TaskTable({ tasks, pageSize = 8 }: TaskTableProps) {
  const { message } = App.useApp();
  const { retryTask, retryStep, cancelTask, deleteTask, cloneTask } = useTasksStore();

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
      pagination={{ pageSize }}
      expandable={{
        rowExpandable: (record) => record.steps.length > 0,
        expandedRowRender: (record) => (
          <WorkflowSteps
            task={record}
            onRetryStep={(stepId) => {
              void retryStep(record.id, stepId);
            }}
          />
        ),
      }}
      locale={{
        emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无任务" />,
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
          render: (status: TaskRecord['status']) => (
            <Tag className={`status-tag ${status}`}>{TASK_STATUS_LABEL[status]}</Tag>
          ),
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
                      onClick={() => void runTaskAction(() => retryTask(record.id), '任务已重新入队')}
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
                      />
                    </Tooltip>
                  </Popconfirm>
                ) : null}
                <Tooltip title="克隆为新任务">
                  <Button
                    size="small"
                    className="secondary-button icon-button"
                    icon={<CopyOutlined />}
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
