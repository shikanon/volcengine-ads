import { create } from 'zustand';

import { api } from '../ipc.js';
import type { CreateTaskRequest, StepStatus, TaskProgressEvent, TaskRecord, TaskStep } from '../../shared/types.js';

interface TasksState {
  tasks: TaskRecord[];
  loading: boolean;
  loadTasks(): Promise<void>;
  createTask(request: CreateTaskRequest): Promise<TaskRecord>;
  retryTask(taskId: string): Promise<void>;
  retryStep(taskId: string, stepId: string): Promise<void>;
  confirmScript(taskId: string): Promise<void>;
  cancelTask(taskId: string): Promise<void>;
  deleteTask(taskId: string): Promise<void>;
  cloneTask(taskId: string): Promise<void>;
  applyProgress(event: TaskProgressEvent): void;
}

function stepStatusFromProgress(task: TaskRecord, step: TaskStep, stepName: string, event: TaskProgressEvent): StepStatus {
  if (event.status === 'success') {
    return 'success';
  }
  if (step.step !== stepName) {
    return step.status;
  }
  if (event.status === 'canceled') {
    return 'canceled';
  }
  if (event.status === 'waiting_confirmation') {
    return 'waiting_confirmation';
  }
  if (event.status === 'paused' || event.status === 'failed') {
    return 'failed';
  }
  const index = task.steps.findIndex((item) => item.step === stepName);
  const total = Math.max(task.steps.length, 1);
  const startProgress = index >= 0 ? Math.floor((index / total) * 100) : event.progress;
  return event.progress > startProgress ? 'success' : 'running';
}

function updateStepFromProgress(task: TaskRecord, step: TaskStep, event: TaskProgressEvent): TaskStep {
  if (event.step === undefined) {
    return { ...step, status: event.status === 'success' ? 'success' : step.status };
  }

  const next: TaskStep = {
    ...step,
    status: stepStatusFromProgress(task, step, event.step, event),
  };
  if (step.step === event.step && event.message !== undefined) {
    next.logs = event.message;
  }
  if (step.step === event.step && event.artifactPath !== undefined) {
    next.artifactPath = event.artifactPath;
  }
  return next;
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
  async retryStep(taskId, stepId) {
    await api.task.retryStep({ taskId, stepId });
    await get().loadTasks();
  },
  async confirmScript(taskId) {
    await api.task.confirmScript({ taskId });
    await get().loadTasks();
  },
  async cancelTask(taskId) {
    await api.task.cancel(taskId);
    await get().loadTasks();
  },
  async deleteTask(taskId) {
    await api.task.delete(taskId);
    set({ tasks: get().tasks.filter((task) => task.id !== taskId) });
  },
  async cloneTask(taskId) {
    const task = await api.task.clone(taskId);
    set({ tasks: [task, ...get().tasks] });
  },
  applyProgress(event) {
    set({
      tasks: get().tasks.map((task) => {
        if (task.id !== event.taskId) {
          return task;
        }
        const steps = task.steps.map((step) => updateStepFromProgress(task, step, event));
        const next: TaskRecord = { ...task, status: event.status, progress: event.progress, steps };
        if (event.message !== undefined) {
          next.error = event.message;
        }
        return next;
      }),
    });
  },
}));
