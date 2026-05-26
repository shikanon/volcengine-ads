import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  App as AntApp,
  ConfigProvider,
  Layout,
  Menu,
  Typography,
} from 'antd';
import {
  AppstoreOutlined,
  ApartmentOutlined,
  ClockCircleOutlined,
  HomeOutlined,
  PlayCircleOutlined,
  RocketOutlined,
  SettingOutlined,
  ThunderboltOutlined,
  UserOutlined,
} from '@ant-design/icons';

import { api } from './ipc.js';
import { TaskTable } from './components/TaskTable.js';
import { Assets } from './pages/Assets.js';
import { Avatar } from './pages/Avatar.js';
import { Explosion } from './pages/Explosion.js';
import { Home } from './pages/Home.js';
import { Native } from './pages/Native.js';
import { Pretrailer } from './pages/Pretrailer.js';
import { Settings } from './pages/Settings.js';
import { Workflows } from './pages/Workflows.js';
import { useTasksStore } from './stores/tasks-store.js';

type PageKey = 'home' | 'explosion' | 'native' | 'pretrailer' | 'avatar' | 'workflows' | 'assets' | 'settings';

const PAGE_TITLES: Record<PageKey, string> = {
  home: '工作台',
  explosion: '广告爆款裂变',
  native: '原生爆款素材',
  pretrailer: '广告前贴',
  avatar: '数字人口播',
  workflows: '工作流',
  assets: '素材库',
  settings: '设置',
};

const PAGE_SUBTITLES: Record<PageKey, string> = {
  home: '本地任务队列',
  explosion: '链接到批量素材',
  native: '五行业工作流生成',
  pretrailer: '原片到开场钩子',
  avatar: '品牌资料到口播视频',
  workflows: '节点逻辑与 Prompt 调试',
  assets: '生成结果与本地文件',
  settings: '模型、存储与本地安全',
};

const NAV_ITEMS: Array<{ key: PageKey; icon: ReactNode; label: string }> = [
  { key: 'home', icon: <HomeOutlined />, label: '工作台' },
  { key: 'explosion', icon: <ThunderboltOutlined />, label: '广告爆款素材裂变' },
  { key: 'native', icon: <RocketOutlined />, label: '原生爆款素材生成' },
  { key: 'pretrailer', icon: <PlayCircleOutlined />, label: '广告吸引前贴生成' },
  { key: 'avatar', icon: <UserOutlined />, label: '广告数字人口播' },
  { key: 'workflows', icon: <ApartmentOutlined />, label: '工作流' },
  { key: 'assets', icon: <AppstoreOutlined />, label: '素材库' },
  { key: 'settings', icon: <SettingOutlined />, label: '设置' },
];

function RecentTasks() {
  const { tasks } = useTasksStore();
  return <TaskTable tasks={tasks} pageSize={6} />;
}

export function App() {
  const [page, setPage] = useState<PageKey>('home');
  const { tasks, loadTasks, applyProgress } = useTasksStore();

  useEffect(() => {
    void loadTasks();
    return api.task.onProgress(applyProgress);
  }, [applyProgress, loadTasks]);

  const content = useMemo(() => {
    if (page === 'explosion') return <Explosion />;
    if (page === 'native') return <Native />;
    if (page === 'pretrailer') return <Pretrailer />;
    if (page === 'avatar') return <Avatar />;
    if (page === 'workflows') return <Workflows />;
    if (page === 'assets') return <Assets />;
    if (page === 'settings') return <Settings />;
    return <Home onNavigate={setPage} />;
  }, [page]);

  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: 'oklch(0.48 0.08 168)',
          colorInfo: 'oklch(0.52 0.085 238)',
          colorSuccess: 'oklch(0.47 0.075 150)',
          colorWarning: 'oklch(0.56 0.105 84)',
          colorError: 'oklch(0.54 0.13 28)',
          colorText: 'oklch(0.32 0.012 170)',
          colorTextSecondary: 'oklch(0.52 0.012 170)',
          colorBgBase: 'oklch(0.965 0.006 170)',
          colorBgContainer: 'oklch(0.998 0.002 170)',
          colorBorder: 'oklch(0.875 0.012 170)',
          borderRadius: 8,
          fontSize: 15,
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", system-ui, sans-serif',
        },
      }}
    >
      <AntApp>
        <Layout className="app-shell">
          <Layout.Sider width={232} className="sidebar">
            <div className="brand-lockup">
              <div className="brand-mark" aria-hidden="true" />
              <div>
                <Typography.Title level={4} className="brand">
                  AIGC Ads Studio
                </Typography.Title>
                <div className="brand-caption">Local workspace</div>
              </div>
            </div>
            <Menu
              mode="inline"
              selectedKeys={[page]}
              className="side-menu"
              onClick={(item) => setPage(item.key as PageKey)}
              items={NAV_ITEMS}
            />
            <div className="sidebar-footer">
              <ClockCircleOutlined />
              <span>本地优先，云端推理</span>
            </div>
          </Layout.Sider>
          <Layout>
            <Layout.Header className="header">
              <div className="page-heading">
                <Typography.Title level={2}>{PAGE_TITLES[page]}</Typography.Title>
                <span>{PAGE_SUBTITLES[page]}</span>
              </div>
              <div className="toolbar-pill" aria-live="polite">
                <ClockCircleOutlined />
                <span>{tasks.filter((task) => task.status === 'running').length} 运行中</span>
              </div>
            </Layout.Header>
            <nav className="compact-nav" aria-label="页面导航">
              {NAV_ITEMS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  aria-current={page === item.key ? 'page' : undefined}
                  onClick={() => setPage(item.key)}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              ))}
            </nav>
            <Layout.Content className="content">
              {content}
              {page !== 'home' ? (
                <section className="section task-strip">
                  <div className="section-heading">
                    <Typography.Title level={4}>最近任务</Typography.Title>
                  </div>
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
