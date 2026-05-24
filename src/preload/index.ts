import { contextBridge, ipcRenderer } from 'electron';
import type { IpcRendererEvent } from 'electron';

import { IPC_CHANNELS } from '../shared/ipc-channels.js';
import type {
  AssetRecord,
  CreateTaskRequest,
  OpenPathRequest,
  PickFileRequest,
  RetryStepRequest,
  SettingsState,
  SettingsUpdate,
  TaskProgressEvent,
  TaskRecord,
} from '../shared/types.js';

const api = {
  task: {
    create: (request: CreateTaskRequest) =>
      ipcRenderer.invoke(IPC_CHANNELS.task.create, request) as Promise<TaskRecord>,
    list: () => ipcRenderer.invoke(IPC_CHANNELS.task.list) as Promise<TaskRecord[]>,
    retry: (taskId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.task.retry, taskId) as Promise<TaskRecord | undefined>,
    retryStep: (request: RetryStepRequest) =>
      ipcRenderer.invoke(IPC_CHANNELS.task.retryStep, request) as Promise<TaskRecord | undefined>,
    onProgress: (callback: (event: TaskProgressEvent) => void) => {
      const listener = (_event: IpcRendererEvent, payload: TaskProgressEvent) => {
        callback(payload);
      };
      ipcRenderer.on(IPC_CHANNELS.event.taskProgress, listener);
      return () => {
        ipcRenderer.off(IPC_CHANNELS.event.taskProgress, listener);
      };
    },
  },
  asset: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.asset.list) as Promise<AssetRecord[]>,
    reveal: (request: OpenPathRequest) => ipcRenderer.invoke(IPC_CHANNELS.asset.reveal, request) as Promise<boolean>,
    pickFiles: (request: PickFileRequest) =>
      ipcRenderer.invoke(IPC_CHANNELS.asset.pickFiles, request) as Promise<string[]>,
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.settings.get) as Promise<SettingsState>,
    set: (update: SettingsUpdate) =>
      ipcRenderer.invoke(IPC_CHANNELS.settings.set, update) as Promise<SettingsState>,
  },
};

contextBridge.exposeInMainWorld('api', api);

export type AppApi = typeof api;
