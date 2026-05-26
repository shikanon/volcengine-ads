import { useMemo, useState } from 'react';
import { Typography } from 'antd';
import { PlayCircleOutlined, RocketOutlined, ThunderboltOutlined, UserOutlined } from '@ant-design/icons';

import { TaskTable } from '../components/TaskTable.js';
import { useTasksStore } from '../stores/tasks-store.js';
import type { TaskStatus } from '../../shared/types.js';

interface HomeProps {
  onNavigate(page: 'explosion' | 'native' | 'pretrailer' | 'avatar'): void;
}

type QueueFilter = 'all' | TaskStatus | 'needs_attention';

const WORKFLOW_LAUNCHERS = [
  {
    key: 'explosion',
    icon: <ThunderboltOutlined />,
    title: '广告爆款裂变',
    description: '视频链接或本地视频，生成脚本、分镜和批量变体。',
    meta: '适合素材放量',
  },
  {
    key: 'native',
    icon: <RocketOutlined />,
    title: '原生爆款素材',
    description: '按行业 brief 生成概念、脚本、素材和成片。',
    meta: '五行业模板',
  },
  {
    key: 'pretrailer',
    icon: <PlayCircleOutlined />,
    title: '广告前贴',
    description: '为原片补一段开场钩子，合成可投放成片。',
    meta: '强化前三秒',
  },
  {
    key: 'avatar',
    icon: <UserOutlined />,
    title: '数字人口播',
    description: '从品牌资料和商品图生成数字人口播广告。',
    meta: '品牌讲解',
  },
] as const;

export function Home({ onNavigate }: HomeProps) {
  const [queueFilter, setQueueFilter] = useState<QueueFilter>('all');
  const { tasks } = useTasksStore();
  const running = tasks.filter((task) => task.status === 'running').length;
  const success = tasks.filter((task) => task.status === 'success').length;
  const queued = tasks.filter((task) => task.status === 'queued').length;
  const needsAttention = tasks.filter((task) => task.status === 'paused' || task.status === 'failed').length;

  const filteredTasks = useMemo(() => {
    if (queueFilter === 'all') {
      return tasks;
    }
    if (queueFilter === 'needs_attention') {
      return tasks.filter((task) => task.status === 'paused' || task.status === 'failed');
    }
    return tasks.filter((task) => task.status === queueFilter);
  }, [queueFilter, tasks]);

  const queueFilters: Array<{ key: QueueFilter; label: string; count: number }> = [
    { key: 'all', label: '全部', count: tasks.length },
    { key: 'running', label: '运行中', count: running },
    { key: 'queued', label: '排队', count: queued },
    { key: 'needs_attention', label: '需处理', count: needsAttention },
    { key: 'success', label: '已完成', count: success },
  ];

  const activeFilterLabel = queueFilters.find((filter) => filter.key === queueFilter)?.label ?? '全部';

  return (
    <div className="home-workspace">
      <section className="home-command" aria-labelledby="home-command-title">
        <div className="home-command-head">
          <div>
            <Typography.Title level={4} id="home-command-title">
              新建广告任务
            </Typography.Title>
            <span>选择一个工作流，素材保留在本地，模型推理按需调用云端。</span>
          </div>
          <span className="local-badge">私有化本地运行</span>
        </div>
        <div className="workflow-launch-list">
          {WORKFLOW_LAUNCHERS.map((workflow) => (
            <button
              key={workflow.key}
              className="workflow-launch-row"
              aria-label={`新建${workflow.title}任务，${workflow.description}`}
              onClick={() => onNavigate(workflow.key)}
            >
              <span className="workflow-launch-icon">{workflow.icon}</span>
              <span className="workflow-launch-copy">
                <strong>{workflow.title}</strong>
                <span>{workflow.description}</span>
              </span>
              <span className="workflow-launch-meta">{workflow.meta}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="queue-summary" aria-labelledby="queue-summary-title">
        <div className="queue-summary-head">
          <div>
            <Typography.Title level={4} id="queue-summary-title">
              任务队列
            </Typography.Title>
            <span>按状态快速收拢最近任务。</span>
          </div>
        </div>
        <div className="queue-filter-list">
          {queueFilters.map((filter) => (
            <button
              key={filter.key}
              className="queue-filter"
              aria-pressed={queueFilter === filter.key}
              aria-label={`筛选${filter.label}任务，共 ${filter.count} 条`}
              onClick={() => setQueueFilter(filter.key)}
            >
              <span>{filter.label}</span>
              <strong>{filter.count}</strong>
            </button>
          ))}
        </div>
      </section>

      <section className="section task-ledger" aria-labelledby="recent-task-title">
        <div className="section-heading">
          <div>
            <Typography.Title level={4} id="recent-task-title">
              最近任务
            </Typography.Title>
            <span>{activeFilterLabel}任务，共 {filteredTasks.length} 条</span>
          </div>
        </div>
        <TaskTable tasks={filteredTasks} pageSize={8} emptyDescription="当前筛选没有任务" />
      </section>
    </div>
  );
}
