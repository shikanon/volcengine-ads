import { describe, expect, it } from 'vitest';

import { SettingsService, StaticSecretProvider } from '../../src/main/secure/keystore.js';
import type { TaskRepository } from '../../src/main/db/index.js';

function createMemoryRepository(): TaskRepository {
  const settings = new Map<string, string>();
  return {
    createTask: () => {
      throw new Error('not implemented');
    },
    listTasks: () => [],
    getTask: () => undefined,
    updateTaskStatus: () => undefined,
    updateTaskProgress: () => undefined,
    updateStepRunning: () => undefined,
    updateStepSuccess: () => undefined,
    updateStepFailed: () => undefined,
    resetStepAndFollowing: () => undefined,
    listAssets: () => [],
    createAsset: () => {
      throw new Error('not implemented');
    },
    getSetting: (key) => settings.get(key),
    setSetting: (key, value) => settings.set(key, value),
    pauseRunningTasks: () => 0,
  };
}

describe('SettingsService', () => {
  it('encrypts secrets and only exposes configured flags publicly', async () => {
    const repository = createMemoryRepository();
    const service = new SettingsService(repository, new StaticSecretProvider('unit-test-secret'));

    await service.updateSettings({ seedanceApiKey: 'secret-key' });

    expect(repository.getSetting('seedanceApiKey')).not.toContain('secret-key');
    await expect(service.getRuntimeCredentials()).resolves.toMatchObject({
      seedanceApiKey: 'secret-key',
    });
    await expect(service.getPublicSettings()).resolves.toMatchObject({
      seedanceConfigured: true,
    });
  });
});
