import { useEffect, useMemo, useState } from 'react';
import {
  App as AntApp,
  Button,
  ConfigProvider,
  Layout,
  Menu,
  Progress,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import {
  AppstoreOutlined,
  HomeOutlined,
  PlayCircleOutlined,
  SettingOutlined,
  SoundOutlined,
  ThunderboltOutlined,
  UserOutlined,
} from '@ant-design/icons';

import { api } from './ipc.js';
import { Assets } from './pages/Assets.js';
import { Avatar } from './pages/Avatar.js';
import { Explosion } from './pages/Explosion.js';
import { Home } from './pages/Home.js';
import { Pretrailer } from './pages/Pretrailer.js';
import { Settings } from './pages/Settings.js';
import { useTasksStore } from './stores/tasks-store.js';
import type { TaskRecord } from '../shared/types.js';

type PageKey = 'home' | 'explosion' | 'pretrailer' | 'avatar' | 'assets' | 'settings';

const PAGE_TITLES: Record<PageKey, string> = {
  home: '工作台',
  explosion: '广告爆款裂变',
  pretrailer: '广告前贴',
  avatar: '数字人口播',
  assets: '素材库',
  settings: '设置',
};

function RecentTasks() {
  const { tasks, retryTask } = useTasksStore();
  return (
    <Table<TaskRecord>
      rowKey="id"
      size="middle"
      pagination={{ pageSize: 6 }}
      dataSource={tasks}
      columns={[
        { title: '类型', dataIndex: 'type', width: 140 },
        {
          title: '状态',
          dataIndex: 'status',
          width: 120,
          render: (status: TaskRecord['status']) => <Tag>{status}</Tag>,
        },
        {
          title: '进度',
          dataIndex: 'progress',
          render: (progress: number) => <Progress percent={progress} size="small" />,
        },
        {
          title: '操作',
          width: 120,
          render: (_, record) =>
            record.status === 'paused' || record.status === 'failed' ? (
              <Button size="small" onClick={() => void retryTask(record.id)}>
                重试
              </Button>
            ) : null,
        },
      ]}
    />
  );
}

export function App() {
  const [page, setPage] = useState<PageKey>('home');
  const { loadTasks, applyProgress } = useTasksStore();

  useEffect(() => {
    void loadTasks();
    return api.task.onProgress(applyProgress);
  }, [applyProgress, loadTasks]);

  const content = useMemo(() => {
    if (page === 'explosion') return <Explosion />;
    if (page === 'pretrailer') return <Pretrailer />;
    if (page === 'avatar') return <Avatar />;
    if (page === 'assets') return <Assets />;
    if (page === 'settings') return <Settings />;
    return <Home onNavigate={setPage} />;
  }, [page]);

  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: '#1f7a5c',
          borderRadius: 6,
          fontSize: 14,
        },
      }}
    >
      <AntApp>
        <Layout className="app-shell">
          <Layout.Sider width={232} className="sidebar">
            <Typography.Title level={4} className="brand">
              AIGC Ads Studio
            </Typography.Title>
            <Menu
              mode="inline"
              selectedKeys={[page]}
              onClick={(item) => setPage(item.key as PageKey)}
              items={[
                { key: 'home', icon: <HomeOutlined />, label: '工作台' },
                { key: 'explosion', icon: <ThunderboltOutlined />, label: '爆款裂变' },
                { key: 'pretrailer', icon: <PlayCircleOutlined />, label: '广告前贴' },
                { key: 'avatar', icon: <UserOutlined />, label: '数字人口播' },
                { key: 'assets', icon: <AppstoreOutlined />, label: '素材库' },
                { key: 'settings', icon: <SettingOutlined />, label: '设置' },
              ]}
            />
          </Layout.Sider>
          <Layout>
            <Layout.Header className="header">
              <Space>
                <SoundOutlined />
                <Typography.Title level={3}>{PAGE_TITLES[page]}</Typography.Title>
              </Space>
            </Layout.Header>
            <Layout.Content className="content">
              {content}
              {page !== 'home' ? (
                <section className="section">
                  <Typography.Title level={4}>最近任务</Typography.Title>
                  <RecentTasks />
                </section>
              ) : null}
            </Layout.Content>
          </Layout>
        </Layout>
      </AntApp>
    </ConfigProvider>
  );
}
