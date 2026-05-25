import { Typography } from 'antd';
import { PlayCircleOutlined, RocketOutlined, ThunderboltOutlined, UserOutlined } from '@ant-design/icons';

import { TaskTable } from '../components/TaskTable.js';
import { useTasksStore } from '../stores/tasks-store.js';

interface HomeProps {
  onNavigate(page: 'explosion' | 'native' | 'pretrailer' | 'avatar'): void;
}

export function Home({ onNavigate }: HomeProps) {
  const { tasks } = useTasksStore();
  const running = tasks.filter((task) => task.status === 'running').length;
  const success = tasks.filter((task) => task.status === 'success').length;
  const paused = tasks.filter((task) => task.status === 'paused' || task.status === 'failed').length;

  return (
    <div className="home-grid">
      <section className="launch-grid">
        <button className="launch-tile primary" onClick={() => onNavigate('explosion')}>
          <ThunderboltOutlined />
          <span className="tile-kicker">Batch Variants</span>
          <strong>广告爆款裂变</strong>
        </button>
        <button className="launch-tile green" onClick={() => onNavigate('native')}>
          <RocketOutlined />
          <span className="tile-kicker">Industry Native</span>
          <strong>原生爆款素材</strong>
        </button>
        <button className="launch-tile blue" onClick={() => onNavigate('pretrailer')}>
          <PlayCircleOutlined />
          <span className="tile-kicker">Opening Hook</span>
          <strong>广告前贴</strong>
        </button>
        <button className="launch-tile coral" onClick={() => onNavigate('avatar')}>
          <UserOutlined />
          <span className="tile-kicker">Avatar Video</span>
          <strong>数字人口播</strong>
        </button>
      </section>

      <section className="metric-row">
        <div className="metric">
          <span>执行中</span>
          <strong>{running}</strong>
        </div>
        <div className="metric">
          <span>已完成</span>
          <strong>{success}</strong>
        </div>
        <div className="metric">
          <span>待处理</span>
          <strong>{paused}</strong>
        </div>
      </section>

      <section className="section page-panel">
        <div className="section-heading">
          <Typography.Title level={4}>最近任务</Typography.Title>
        </div>
        <TaskTable tasks={tasks} pageSize={8} />
      </section>
    </div>
  );
}
