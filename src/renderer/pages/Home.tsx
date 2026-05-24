import { Button, Col, Row, Space, Statistic, Table, Typography } from 'antd';
import { PlayCircleOutlined, ThunderboltOutlined, UserOutlined } from '@ant-design/icons';

import { useTasksStore } from '../stores/tasks-store.js';
import type { TaskRecord } from '../../shared/types.js';

interface HomeProps {
  onNavigate(page: 'explosion' | 'pretrailer' | 'avatar'): void;
}

export function Home({ onNavigate }: HomeProps) {
  const { tasks, retryTask } = useTasksStore();
  const running = tasks.filter((task) => task.status === 'running').length;
  const success = tasks.filter((task) => task.status === 'success').length;
  const paused = tasks.filter((task) => task.status === 'paused' || task.status === 'failed').length;

  return (
    <Space direction="vertical" size={18} className="full-width">
      <Row gutter={16}>
        <Col span={8}>
          <button className="feature-tile green" onClick={() => onNavigate('explosion')}>
            <ThunderboltOutlined />
            <span>广告爆款裂变</span>
          </button>
        </Col>
        <Col span={8}>
          <button className="feature-tile blue" onClick={() => onNavigate('pretrailer')}>
            <PlayCircleOutlined />
            <span>广告前贴</span>
          </button>
        </Col>
        <Col span={8}>
          <button className="feature-tile coral" onClick={() => onNavigate('avatar')}>
            <UserOutlined />
            <span>数字人口播</span>
          </button>
        </Col>
      </Row>
      <Row gutter={16}>
        <Col span={8}>
          <Statistic title="执行中" value={running} />
        </Col>
        <Col span={8}>
          <Statistic title="已完成" value={success} />
        </Col>
        <Col span={8}>
          <Statistic title="待处理" value={paused} />
        </Col>
      </Row>
      <section className="section">
        <Typography.Title level={4}>最近任务</Typography.Title>
        <Table<TaskRecord>
          rowKey="id"
          dataSource={tasks}
          pagination={{ pageSize: 8 }}
          columns={[
            { title: '类型', dataIndex: 'type', width: 160 },
            { title: '状态', dataIndex: 'status', width: 130 },
            { title: '进度', dataIndex: 'progress', width: 120, render: (value: number) => `${value}%` },
            {
              title: '操作',
              render: (_, record) =>
                record.status === 'paused' || record.status === 'failed' ? (
                  <Button size="small" onClick={() => void retryTask(record.id)}>
                    重试
                  </Button>
                ) : null,
            },
          ]}
        />
      </section>
    </Space>
  );
}
