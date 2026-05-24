import { create } from 'zustand';

import { api } from '../ipc.js';
import type { CreateTaskRequest, TaskProgressEvent, TaskRecord } from '../../shared/types.js';

interface TasksState {
  tasks: TaskRecord[];
  loading: boolean;
  loadTasks(): Promise<void>;
  createTask(request: CreateTaskRequest): Promise<TaskRecord>;
  retryTask(taskId: string): Promise<void>;
  applyProgress(event: TaskProgressEvent): void;
}

export const useTasksStore = create<TasksState>((set, get) => ({
  tasks: [],
  loading: false,
  async loadTasks() {
    set({ loading: true });
    try {
      set({ tasks: await api.task.list() });
    } finally {
      set({ loading: false });
    }
  },
  async createTask(request) {
    const task = await api.task.create(request);
    set({ tasks: [task, ...get().tasks] });
    return task;
  },
  async retryTask(taskId) {
    await api.task.retry(taskId);
    await get().loadTasks();
  },
  applyProgress(event) {
    set({
      tasks: get().tasks.map((task) => {
        if (task.id !== event.taskId) {
          return task;
        }
        const next: TaskRecord = { ...task, status: event.status, progress: event.progress };
        if (event.message !== undefined) {
          next.error = event.message;
        }
        return next;
      }),
    });
  },
}));
