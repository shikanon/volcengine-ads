import { useEffect, useState } from 'react';
import { BarChartOutlined, FolderOpenOutlined } from '@ant-design/icons';
import { Button, Empty, Form, Input, Select, Space, Tag, Typography, message } from 'antd';

import { TaskTable, VideoScoringVisualPreview } from '../components/TaskTable.js';
import { api } from '../ipc.js';
import { useTasksStore } from '../stores/tasks-store.js';
import {
  VIDEO_SCORING_CATEGORY_DEFINITIONS,
  type TaskRecord,
  type AdVideoScoringCategory,
  type VideoScoringInput,
} from '../../shared/types.js';

interface FormValues {
  sourceVideoPath?: string;
  category: AdVideoScoringCategory;
}

const CATEGORY_OPTIONS = VIDEO_SCORING_CATEGORY_DEFINITIONS.map((definition) => ({
  value: definition.value,
  label: definition.label,
}));

const DEFAULT_CATEGORY_DEFINITION = {
  value: 'brand' as const,
  label: '品牌广告',
  description: '关注品牌露出、一致性、制作质量、情感叙事与品牌好感。',
};

const ACTIVE_STATUSES: TaskRecord['status'][] = ['queued', 'running', 'waiting_confirmation', 'paused', 'failed'];
const TASK_STATUS_LABEL: Record<TaskRecord['status'], string> = {
  queued: '排队',
  running: '运行中',
  success: '已完成',
  failed: '失败',
  paused: '暂停',
  canceled: '已取消',
  waiting_confirmation: '待确认',
};
const INLINE_RESULT_LIMIT = 3;

interface ScoreArtifactState {
  loading: boolean;
  content?: string;
  error?: string;
  truncated?: boolean;
}

function getTaskCategory(task: TaskRecord): AdVideoScoringCategory {
  return (task.input as VideoScoringInput).category;
}

function getScoreArtifactPath(task: TaskRecord): string | undefined {
  return task.steps.find((step) => step.step === 'score')?.artifactPath;
}

function formatTaskTime(value: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value);
}

function InlineScoreBoard({
  task,
  title,
  subtitle,
}: {
  task: TaskRecord;
  title: string;
  subtitle: string;
}) {
  const [state, setState] = useState<ScoreArtifactState>({ loading: false });
  const category =
    VIDEO_SCORING_CATEGORY_DEFINITIONS.find((definition) => definition.value === getTaskCategory(task)) ??
    DEFAULT_CATEGORY_DEFINITION;
  const scoreArtifactPath = getScoreArtifactPath(task);

  useEffect(() => {
    let alive = true;
    if (!scoreArtifactPath) {
      setState({ loading: false });
      return () => {
        alive = false;
      };
    }

    setState({ loading: true });
    void api.asset
      .readText({ path: scoreArtifactPath, maxBytes: 1024 * 1024 })
      .then((result) => {
        if (!alive) {
          return;
        }
        setState({
          loading: false,
          content: result.content,
          truncated: result.truncated,
        });
      })
      .catch((error) => {
        if (!alive) {
          return;
        }
        setState({
          loading: false,
          error: error instanceof Error ? error.message : String(error),
        });
      });

    return () => {
      alive = false;
    };
  }, [scoreArtifactPath]);

  return (
    <article className="video-scoring-inline-board">
      <div className="video-scoring-inline-board-header">
        <div>
          <Typography.Text strong>{title}</Typography.Text>
          <span>{subtitle}</span>
        </div>
        <Tag className={`status-tag ${task.status}`}>{TASK_STATUS_LABEL[task.status]}</Tag>
      </div>
      <div className="video-scoring-inline-meta">
        <div className="video-scoring-inline-meta-item">
          <span>广告类型</span>
          <strong>{category.label}</strong>
        </div>
        <div className="video-scoring-inline-meta-item">
          <span>任务时间</span>
          <strong>{formatTaskTime(task.updatedAt)}</strong>
        </div>
        <div className="video-scoring-inline-meta-item">
          <span>当前进度</span>
          <strong>{task.progress}%</strong>
        </div>
      </div>
      {state.loading ? (
        <div className="video-scoring-inline-empty">正在读取评分结果...</div>
      ) : null}
      {!state.loading && state.error ? (
        <div className="video-scoring-inline-empty">评分结果读取失败：{state.error}</div>
      ) : null}
      {!state.loading && !state.error && !scoreArtifactPath ? (
        <div className="video-scoring-inline-empty">
          评分节点尚未产出 `score.json`，任务运行到“视频评分”后会自动在这里展示雷达图、条形图、证据和 BGM 分析。
        </div>
      ) : null}
      {!state.loading && !state.error && state.content ? (
        <>
          {state.truncated ? (
            <Typography.Text className="artifact-preview-note">
              评分文件较大，页面仅展示前 1MB 内容生成的数据看板。
            </Typography.Text>
          ) : null}
          <VideoScoringVisualPreview content={state.content} />
        </>
      ) : null}
    </article>
  );
}

export function VideoScoring() {
  const [form] = Form.useForm<FormValues>();
  const { createTask, tasks } = useTasksStore((state) => ({
    createTask: state.createTask,
    tasks: state.tasks,
  }));
  const category = Form.useWatch('category', form) ?? 'brand';
  const categoryDefinition =
    VIDEO_SCORING_CATEGORY_DEFINITIONS.find((definition) => definition.value === category) ?? DEFAULT_CATEGORY_DEFINITION;
  const scoringTasks = tasks.filter((task) => task.type === 'video_scoring');
  const currentTask = scoringTasks.find((task) => ACTIVE_STATUSES.includes(task.status));
  const recentTasks = currentTask
    ? scoringTasks.filter((task) => task.id !== currentTask.id)
    : scoringTasks;
  const recentResultTasks = recentTasks.filter((task) => getScoreArtifactPath(task)).slice(0, INLINE_RESULT_LIMIT);

  async function pickVideo() {
    const [path] = await api.asset.pickFiles({
      filters: [{ name: 'Video', extensions: ['mp4', 'mov', 'm4v'] }],
    });
    if (path) {
      form.setFieldValue('sourceVideoPath', path);
    }
  }

  async function submit(values: FormValues) {
    if (!values.sourceVideoPath) {
      void message.error('请选择本地广告视频');
      return;
    }
    await createTask({
      type: 'video_scoring',
      input: {
        sourceVideoPath: values.sourceVideoPath,
        category: values.category,
      },
    });
    form.resetFields();
    void message.success('广告视频评分任务已入队');
  }

  return (
    <div className="video-scoring-page">
      <section className="section page-panel">
        <div className="form-shell">
          <div className="form-header">
            <div>
              <Typography.Title level={4}>创建广告视频打分任务</Typography.Title>
              <span>上传完整广告视频，按类型输出维度分数、证据、分析与优化建议</span>
            </div>
            <div className="native-strategy">
              <strong>{categoryDefinition.label}</strong>
              <span>{categoryDefinition.description}</span>
            </div>
          </div>
          <Form<FormValues>
            form={form}
            className="desktop-form"
            layout="vertical"
            initialValues={{ category: 'brand' }}
            onFinish={(values) => void submit(values)}
          >
            <Form.Item label="本地广告视频" required>
              <Space.Compact className="full-width">
                <Form.Item name="sourceVideoPath" noStyle rules={[{ required: true, message: '请选择本地视频' }]}>
                  <Input readOnly placeholder="选择本地视频文件" />
                </Form.Item>
                <Button
                  type="default"
                  className="file-picker-button"
                  icon={<FolderOpenOutlined />}
                  aria-label="选择本地广告视频"
                  onClick={() => void pickVideo()}
                />
              </Space.Compact>
            </Form.Item>
            <Form.Item name="category" label="广告类型" rules={[{ required: true }]}>
              <Select<AdVideoScoringCategory> options={CATEGORY_OPTIONS} />
            </Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              icon={<BarChartOutlined />}
              className="primary-action"
            >
              开始视频打分
            </Button>
          </Form>
        </div>
      </section>
      <div className="video-scoring-board-stack">
        <section className="section page-panel">
          <div className="section-heading">
            <div>
              <Typography.Title level={4}>当前任务看板</Typography.Title>
              <span>当前任务在评分节点产出后，页面底部直接展示评分图表、证据、分析、建议与 BGM 结果。</span>
            </div>
          </div>
          {currentTask ? (
            <div className="video-scoring-live-board">
              <InlineScoreBoard
                task={currentTask}
                title="当前任务结果"
                subtitle="任务状态变化后自动刷新，适合边跑边看当前评分数据。"
              />
              <TaskTable tasks={[currentTask]} pageSize={1} emptyDescription="当前没有进行中的评分任务" />
            </div>
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无进行中的评分任务，创建后会优先显示在这里。" />
          )}
        </section>
        <section className="section page-panel">
          <div className="section-heading">
            <div>
              <Typography.Title level={4}>最近评分任务</Typography.Title>
              <span>最近完成或已产出评分结果的任务会直接显示在这里，下面仍保留完整步骤表。</span>
            </div>
          </div>
          {recentResultTasks.length > 0 ? (
            <div className="video-scoring-results-grid">
              {recentResultTasks.map((task) => (
                <InlineScoreBoard
                  key={task.id}
                  task={task}
                  title={`${formatTaskTime(task.updatedAt)} · ${VIDEO_SCORING_CATEGORY_DEFINITIONS.find((definition) => definition.value === getTaskCategory(task))?.label ?? DEFAULT_CATEGORY_DEFINITION.label}`}
                  subtitle="读取最近一次 score.json 结果，便于横向查看历史评分表现。"
                />
              ))}
            </div>
          ) : (
            <div className="video-scoring-inline-empty">最近任务还没有可直接展示的评分结果。</div>
          )}
          <div className="video-scoring-inline-table">
            <TaskTable tasks={recentTasks} pageSize={6} emptyDescription="还没有广告视频打分任务" />
          </div>
        </section>
      </div>
    </div>
  );
}
