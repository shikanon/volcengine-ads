import { ipcMain } from 'electron';
import log from 'electron-log/main.js';

import type { TaskRepository } from '../db/index.js';
import type { TaskWorker } from '../queue/worker.js';
import { IPC_CHANNELS } from '../../shared/ipc-channels.js';
import type { ConfirmScriptRequest, CreateTaskRequest, RetryStepRequest } from '../../shared/types.js';

export function registerTaskIpc(repository: TaskRepository, worker: TaskWorker): void {
  ipcMain.handle(IPC_CHANNELS.task.create, (_event, request: CreateTaskRequest) => {
    try {
      return worker.createTask(request);
    } catch (error) {
      log.error('task:create failed', error);
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.task.list, () => repository.listTasks());

  ipcMain.handle(IPC_CHANNELS.task.retry, (_event, taskId: string) => {
    worker.retryTask(taskId);
    return repository.getTask(taskId);
  });

  ipcMain.handle(IPC_CHANNELS.task.retryStep, (_event, request: RetryStepRequest) => {
    worker.retryStep(request);
    return repository.getTask(request.taskId);
  });

  ipcMain.handle(IPC_CHANNELS.task.confirmScript, (_event, request: ConfirmScriptRequest) => {
    try {
      return worker.confirmScript(request.taskId);
    } catch (error) {
      log.error('task:confirm-script failed', error);
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.task.cancel, (_event, taskId: string) => {
    try {
      return worker.cancelTask(taskId);
    } catch (error) {
      log.error('task:cancel failed', error);
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.task.delete, (_event, taskId: string) => {
    try {
      return worker.deleteTask(taskId);
    } catch (error) {
      log.error('task:delete failed', error);
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.task.clone, (_event, taskId: string) => {
    try {
      return worker.cloneTask(taskId);
    } catch (error) {
      log.error('task:clone failed', error);
      throw error;
    }
  });
}
