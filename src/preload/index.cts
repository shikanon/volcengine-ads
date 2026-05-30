import type { IpcRendererEvent } from 'electron';

import type {
  AssetRecord,
  ConfirmScriptRequest,
  CreateTaskRequest,
  OpenPathRequest,
  PickFileRequest,
  ReadTextRequest,
  ReadTextResult,
  RetryStepRequest,
  SettingsState,
  SettingsUpdate,
  TaskProgressEvent,
  TaskRecord,
} from '../shared/types.js';

const { contextBridge, ipcRenderer } = require('electron') as typeof import('electron');

const IPC_CHANNELS = {
  task: {
    create: 'task:create',
    list: 'task:list',
    retry: 'task:retry',
    retryStep: 'task:retry-step',
    confirmScript: 'task:confirm-script',
    cancel: 'task:cancel',
    delete: 'task:delete',
    clone: 'task:clone',
  },
  asset: {
    list: 'asset:list',
    open: 'asset:open',
    reveal: 'asset:reveal',
    readText: 'asset:read-text',
    pickFiles: 'asset:pick-files',
  },
  settings: {
    get: 'settings:get',
    set: 'settings:set',
  },
  event: {
    taskProgress: 'event:task-progress',
  },
} as const;

const api = {
  task: {
    create: (request: CreateTaskRequest) =>
      ipcRenderer.invoke(IPC_CHANNELS.task.create, request) as Promise<TaskRecord>,
    list: () => ipcRenderer.invoke(IPC_CHANNELS.task.list) as Promise<TaskRecord[]>,
    retry: (taskId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.task.retry, taskId) as Promise<TaskRecord | undefined>,
    retryStep: (request: RetryStepRequest) =>
      ipcRenderer.invoke(IPC_CHANNELS.task.retryStep, request) as Promise<TaskRecord | undefined>,
    confirmScript: (request: ConfirmScriptRequest) =>
      ipcRenderer.invoke(IPC_CHANNELS.task.confirmScript, request) as Promise<TaskRecord>,
    cancel: (taskId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.task.cancel, taskId) as Promise<TaskRecord | undefined>,
    delete: (taskId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.task.delete, taskId) as Promise<boolean>,
    clone: (taskId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.task.clone, taskId) as Promise<TaskRecord>,
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
    open: (request: OpenPathRequest) =>
      ipcRenderer.invoke(IPC_CHANNELS.asset.open, request) as Promise<boolean>,
    reveal: (request: OpenPathRequest) =>
      ipcRenderer.invoke(IPC_CHANNELS.asset.reveal, request) as Promise<boolean>,
    readText: (request: ReadTextRequest) =>
      ipcRenderer.invoke(IPC_CHANNELS.asset.readText, request) as Promise<ReadTextResult>,
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
