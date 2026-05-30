import { describe, expect, it } from 'vitest';

import { SettingsService, StaticSecretProvider } from '../../src/main/secure/keystore.js';
import type { TaskRepository } from '../../src/main/db/index.js';

function createMemoryRepository(): TaskRepository {
  const settings = new Map<string, string>();
  return {
    createTask: () => {
      throw new Error('not implemented');
    },
    cloneTask: () => undefined,
    listTasks: () => [],
    getTask: () => undefined,
    cancelTask: () => undefined,
    deleteTask: () => false,
    updateTaskStatus: () => undefined,
    updateTaskProgress: () => undefined,
    updateStepRunning: () => undefined,
    updateStepWaitingConfirmation: () => undefined,
    updateStepSuccess: () => undefined,
    updateStepFailed: () => undefined,
    confirmWaitingStep: () => undefined,
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
  it('encrypts secrets at rest and returns local settings values', async () => {
    const repository = createMemoryRepository();
    const service = new SettingsService(repository, new StaticSecretProvider('unit-test-secret'));

    await service.updateSettings({ seedanceApiKey: 'secret-key', ttsApiKey: 'tts-secret-key' });

    expect(repository.getSetting('seedanceApiKey')).not.toContain('secret-key');
    expect(repository.getSetting('ttsApiKey')).not.toContain('tts-secret-key');
    await expect(service.getRuntimeCredentials()).resolves.toMatchObject({
      seedanceApiKey: 'secret-key',
      ttsApiKey: 'tts-secret-key',
    });
    await expect(service.getPublicSettings()).resolves.toMatchObject({
      seedanceConfigured: true,
      seedanceApiKey: 'secret-key',
      ttsConfigured: true,
      ttsApiKey: 'tts-secret-key',
    });
  });

  it('uses current model defaults and upgrades legacy default model ids', async () => {
    const repository = createMemoryRepository();
    repository.setSetting(
      'provider',
      JSON.stringify({
        seedanceModel: 'doubao-seedance-2-0',
        llmModel: 'doubao-seed-1-6',
        ttsVoice: 'volcano_tts',
      }),
    );
    const service = new SettingsService(repository, new StaticSecretProvider('unit-test-secret'));

    await expect(service.getPublicSettings()).resolves.toMatchObject({
      provider: {
        seedanceModel: 'doubao-seedance-2-0-260128',
        imageModel: 'doubao-seedream-5-0-260128',
        llmModel: 'doubao-seed-2-0-pro-260215',
        ttsVoice: 'zh_female_vv_uranus_bigtts',
      },
    });
  });

  it('accepts plaintext local test secrets from the settings database', async () => {
    const repository = createMemoryRepository();
    repository.setSetting('llmApiKey', 'plain-local-test-key');
    const service = new SettingsService(repository, new StaticSecretProvider('unit-test-secret'));

    await expect(service.getRuntimeCredentials()).resolves.toMatchObject({
      llmApiKey: 'plain-local-test-key',
    });
  });
});
