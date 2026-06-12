import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../../src/renderer/ipc.js';
import { useTasksStore } from '../../src/renderer/stores/tasks-store.js';
import type { TaskRecord } from '../../src/shared/types.js';

vi.mock('../../src/renderer/ipc.js', () => ({
  api: {
    task: {
      list: vi.fn(),
      create: vi.fn(),
      retry: vi.fn(),
      retryStep: vi.fn(),
      confirmScript: vi.fn(),
      cancel: vi.fn(),
      delete: vi.fn(),
      clone: vi.fn(),
    },
  },
}));

function createTask(): TaskRecord {
  return {
    id: 'task-1',
    type: 'lark_download',
    status: 'running',
    progress: 50,
    input: { url: 'https://bytedance.larkoffice.com/wiki/demo' },
    createdAt: Date.now(),
    updatedAt: Date.now(),
    steps: [
      {
        id: 'step-1',
        step: 'download',
        status: 'running',
      },
    ],
  };
}

describe('tasks store progress updates', () => {
  beforeEach(() => {
    vi.mocked(api.task.list).mockResolvedValue([createTask()]);
    useTasksStore.setState({
      tasks: [createTask()],
      loading: false,
      loadTasks: useTasksStore.getState().loadTasks,
      createTask: useTasksStore.getState().createTask,
      retryTask: useTasksStore.getState().retryTask,
      retryStep: useTasksStore.getState().retryStep,
      confirmScript: useTasksStore.getState().confirmScript,
      cancelTask: useTasksStore.getState().cancelTask,
      deleteTask: useTasksStore.getState().deleteTask,
      cloneTask: useTasksStore.getState().cloneTask,
      applyProgress: useTasksStore.getState().applyProgress,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    useTasksStore.setState({
      tasks: [],
      loading: false,
      loadTasks: useTasksStore.getState().loadTasks,
      createTask: useTasksStore.getState().createTask,
      retryTask: useTasksStore.getState().retryTask,
      retryStep: useTasksStore.getState().retryStep,
      confirmScript: useTasksStore.getState().confirmScript,
      cancelTask: useTasksStore.getState().cancelTask,
      deleteTask: useTasksStore.getState().deleteTask,
      cloneTask: useTasksStore.getState().cloneTask,
      applyProgress: useTasksStore.getState().applyProgress,
    });
  });

  it('stores step artifactPath and logs from progress events', () => {
    useTasksStore.getState().applyProgress({
      taskId: 'task-1',
      status: 'running',
      progress: 100,
      step: 'download',
      artifactPath: '/tmp/download-summary.json',
      logs: '发现 3 个视频块，成功 3 个，失败 0 个。',
    });

    const task = useTasksStore.getState().tasks[0];
    expect(task?.steps[0]).toMatchObject({
      status: 'success',
      artifactPath: '/tmp/download-summary.json',
      logs: '发现 3 个视频块，成功 3 个，失败 0 个。',
    });
    expect(task?.error).toBeUndefined();
  });

  it('refreshes outputs from server when progress event requests it', async () => {
    vi.mocked(api.task.list).mockResolvedValueOnce([
      {
        ...createTask(),
        progress: 100,
        steps: [
          {
            id: 'step-1',
            step: 'download',
            status: 'success',
            artifactPath: '/tmp/final-summary.json',
            logs: '服务端最终输出',
          },
        ],
      },
    ]);

    useTasksStore.getState().applyProgress({
      taskId: 'task-1',
      status: 'running',
      progress: 100,
      step: 'download',
      artifactPath: '/tmp/local-summary.json',
      logs: '本地事件输出',
      refreshOutputs: true,
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(api.task.list).toHaveBeenCalledTimes(1);
    const task = useTasksStore.getState().tasks[0];
    expect(task?.steps[0]).toMatchObject({
      status: 'success',
      artifactPath: '/tmp/final-summary.json',
      logs: '服务端最终输出',
    });
  });
});
