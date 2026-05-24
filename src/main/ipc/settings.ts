import { ipcMain } from 'electron';
import log from 'electron-log/main.js';

import type { SettingsService } from '../secure/keystore.js';
import { IPC_CHANNELS } from '../../shared/ipc-channels.js';
import type { SettingsUpdate } from '../../shared/types.js';

export function registerSettingsIpc(settings: SettingsService): void {
  ipcMain.handle(IPC_CHANNELS.settings.get, async () => settings.getPublicSettings());

  ipcMain.handle(IPC_CHANNELS.settings.set, async (_event, update: SettingsUpdate) => {
    try {
      return await settings.updateSettings(update);
    } catch (error) {
      log.error('settings:set failed', error);
      throw error;
    }
  });
}
