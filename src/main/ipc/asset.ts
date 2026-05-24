import { dialog, ipcMain, shell } from 'electron';
import log from 'electron-log/main.js';

import type { TaskRepository } from '../db/index.js';
import { IPC_CHANNELS } from '../../shared/ipc-channels.js';
import type { OpenPathRequest, PickFileRequest } from '../../shared/types.js';

export function registerAssetIpc(repository: TaskRepository): void {
  ipcMain.handle(IPC_CHANNELS.asset.list, () => repository.listAssets());

  ipcMain.handle(IPC_CHANNELS.asset.reveal, async (_event, request: OpenPathRequest) => {
    try {
      shell.showItemInFolder(request.path);
      return true;
    } catch (error) {
      log.error('asset:reveal failed', error);
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
