import { app, BrowserWindow, dialog } from 'electron';
import { join } from 'node:path';

import log from 'electron-log/main.js';

import { createRepository } from './db/index.js';
import { registerAssetIpc } from './ipc/asset.js';
import { registerSettingsIpc } from './ipc/settings.js';
import { registerTaskIpc } from './ipc/task.js';
import { VolcengineModelClientFactory } from './model-client/volcengine.js';
import { pauseRunningTasks } from './queue/recover.js';
import { TaskWorker } from './queue/worker.js';
import { SettingsService } from './secure/keystore.js';
import { IPC_CHANNELS } from '../shared/ipc-channels.js';

let mainWindow: BrowserWindow | undefined;

function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 1024,
    minHeight: 720,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: join(app.getAppPath(), 'dist/preload/index.js'),
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    void window.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else if (!app.isPackaged) {
    void window.loadURL('http://127.0.0.1:5173');
  } else {
    void window.loadFile(join(app.getAppPath(), 'dist/renderer/index.html'));
  }
  return window;
}

async function bootstrap(): Promise<void> {
  log.initialize();
  const repository = await createRepository(app.getPath('userData'));
  pauseRunningTasks(repository);
  const settingsService = new SettingsService(repository);
  const modelClientFactory = new VolcengineModelClientFactory(() =>
    settingsService.getRuntimeCredentials(),
  );
  const worker = new TaskWorker(
    repository,
    modelClientFactory,
    app.getPath('userData'),
    (event) => mainWindow?.webContents.send(IPC_CHANNELS.event.taskProgress, event),
  );

  registerTaskIpc(repository, worker);
  registerAssetIpc(repository);
  registerSettingsIpc(settingsService);

  mainWindow = createMainWindow();
  const settings = await settingsService.getPublicSettings();
  if (!settings.complianceAccepted) {
    const result = await dialog.showMessageBox(mainWindow, {
      type: 'info',
      buttons: ['我已知晓并同意'],
      defaultId: 0,
      title: '版权合规提示',
      message: '抖音下载仅供个人学习与素材分析，版权合规责任由使用方承担。',
    });
    if (result.response === 0) {
      await settingsService.updateSettings({ complianceAccepted: true });
    }
  }
}

app.whenReady().then(() => {
  void bootstrap();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    mainWindow = createMainWindow();
  }
});
