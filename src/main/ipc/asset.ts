import { dialog, ipcMain, shell } from 'electron';
import log from 'electron-log/main.js';
import { readFile, stat } from 'node:fs/promises';
import { extname } from 'node:path';

import type { TaskRepository } from '../db/index.js';
import { AppError } from '../errors.js';
import { IPC_CHANNELS } from '../../shared/ipc-channels.js';
import type { OpenPathRequest, PickFileRequest, ReadTextRequest } from '../../shared/types.js';

const DEFAULT_PREVIEW_BYTES = 512 * 1024;
const MAX_PREVIEW_BYTES = 1024 * 1024;
const PREVIEWABLE_EXTENSIONS = new Set([
  '.csv',
  '.json',
  '.log',
  '.md',
  '.srt',
  '.txt',
  '.vtt',
]);

function getPreviewByteLimit(request: ReadTextRequest): number {
  if (request.maxBytes === undefined) {
    return DEFAULT_PREVIEW_BYTES;
  }
  return Math.min(Math.max(request.maxBytes, 1), MAX_PREVIEW_BYTES);
}

export function registerAssetIpc(repository: TaskRepository): void {
  ipcMain.handle(IPC_CHANNELS.asset.list, () => repository.listAssets());

  ipcMain.handle(IPC_CHANNELS.asset.open, async (_event, request: OpenPathRequest) => {
    try {
      const error = await shell.openPath(request.path);
      if (error) {
        throw new AppError('E_INPUT_VALIDATION', error);
      }
      return true;
    } catch (error) {
      log.error('asset:open failed', error);
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.asset.reveal, async (_event, request: OpenPathRequest) => {
    try {
      shell.showItemInFolder(request.path);
      return true;
    } catch (error) {
      log.error('asset:reveal failed', error);
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.asset.readText, async (_event, request: ReadTextRequest) => {
    try {
      const extension = extname(request.path).toLowerCase();
      if (!PREVIEWABLE_EXTENSIONS.has(extension)) {
        throw new AppError('E_INPUT_VALIDATION', '该产物不是可预览的文本文件');
      }
      const fileStat = await stat(request.path);
      if (!fileStat.isFile()) {
        throw new AppError('E_INPUT_VALIDATION', '该产物不是文件');
      }
      const byteLimit = getPreviewByteLimit(request);
      const buffer = await readFile(request.path);
      const truncated = buffer.byteLength > byteLimit;
      const content = buffer.subarray(0, byteLimit).toString('utf8');
      return { path: request.path, content, truncated };
    } catch (error) {
      log.error('asset:read-text failed', error);
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.asset.pickFiles, async (_event, request: PickFileRequest) => {
    const result = await dialog.showOpenDialog({
      properties: request.multi ? ['openFile', 'multiSelections'] : ['openFile'],
      filters: request.filters,
    });
    return result.canceled ? [] : result.filePaths;
  });
}
