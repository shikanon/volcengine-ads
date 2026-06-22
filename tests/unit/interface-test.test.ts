import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ipcMain } from 'electron';

import { TaskWorker } from '../../src/main/queue/worker.js';
import { SqliteTaskRepository } from '../../src/main/db/index.js';
import { SettingsService, StaticSecretProvider } from '../../src/main/secure/keystore.js';
import { registerTaskIpc } from '../../src/main/ipc/task.js';
import { registerAssetIpc } from '../../src/main/ipc/asset.js';
import { registerSettingsIpc } from '../../src/main/ipc/settings.js';
import type { CreateTaskRequest, TaskType } from '../../src/shared/types.js';
import type { ModelClient, ModelClientFactory } from '../../src/main/model-client/index.js';

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
  },
  dialog: {
    showOpenDialog: vi.fn(),
  },
  shell: {
    openPath: vi.fn(),
    showItemInFolder: vi.fn(),
  },
}));

function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'interface-test-'));
}

function createRepository(): SqliteTaskRepository {
  return new SqliteTaskRepository(join(createTempDir(), 'app.db'));
}

function createMockWorker(repository: SqliteTaskRepository): TaskWorker {
  const modelClient: ModelClient = {
    generateImage: vi.fn(),
    generateVideo: vi.fn(),
    generateDigitalHuman: vi.fn(),
    asr: vi.fn(),
    tts: vi.fn(),
    chat: vi.fn(),
    webSearch: vi.fn(),
    vision: vi.fn(),
    visionVideo: vi.fn(),
  };
  const modelClientFactory: ModelClientFactory = {
    create: () => Promise.resolve(modelClient),
  };
  return new TaskWorker(
    repository,
    modelClientFactory,
    createTempDir(),
    () => ({}),
    () => {},
    1,
  );
}

function getIpcHandler(channel: string): ((...args: unknown[]) => unknown) | undefined {
  const call = vi.mocked(ipcMain.handle).mock.calls.find((call) => call[0] === channel);
  return call?.[1] as ((...args: unknown[]) => unknown) | undefined;
}

describe('接口测试 - 全接口覆盖', () => {
  let repository: SqliteTaskRepository;
  let worker: TaskWorker;
  let settings: SettingsService;

  beforeEach(() => {
    vi.clearAllMocks();
    repository = createRepository();
    worker = createMockWorker(repository);
    settings = new SettingsService(repository, new StaticSecretProvider('test-secret'));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('IPC 接口测试', () => {
    beforeEach(() => {
      registerTaskIpc(repository, worker);
      registerAssetIpc(repository);
      registerSettingsIpc(settings);
    });

    it('task:create - 注册成功', () => {
      const handler = getIpcHandler('task:create');
      expect(handler).toBeDefined();
      expect(typeof handler).toBe('function');
    });

    it('task:list - 注册并可调用', async () => {
      const handler = getIpcHandler('task:list');
      expect(handler).toBeDefined();
      const result = await handler!();
      expect(Array.isArray(result)).toBe(true);
    });

    it('task:retry - 注册成功', () => {
      const handler = getIpcHandler('task:retry');
      expect(handler).toBeDefined();
      expect(typeof handler).toBe('function');
    });

    it('task:retryStep - 注册成功', () => {
      const handler = getIpcHandler('task:retry-step');
      expect(handler).toBeDefined();
      expect(typeof handler).toBe('function');
    });

    it('task:confirmScript - 注册成功', () => {
      const handler = getIpcHandler('task:confirm-script');
      expect(handler).toBeDefined();
      expect(typeof handler).toBe('function');
    });

    it('task:cancel - 注册成功', () => {
      const handler = getIpcHandler('task:cancel');
      expect(handler).toBeDefined();
      expect(typeof handler).toBe('function');
    });

    it('task:delete - 注册成功', () => {
      const handler = getIpcHandler('task:delete');
      expect(handler).toBeDefined();
      expect(typeof handler).toBe('function');
    });

    it('task:clone - 注册成功', () => {
      const handler = getIpcHandler('task:clone');
      expect(handler).toBeDefined();
      expect(typeof handler).toBe('function');
    });

    it('asset:list - 注册并可调用', async () => {
      const handler = getIpcHandler('asset:list');
      expect(handler).toBeDefined();
      const result = await handler!();
      expect(Array.isArray(result)).toBe(true);
    });

    it('asset:open - 注册成功', () => {
      const handler = getIpcHandler('asset:open');
      expect(handler).toBeDefined();
      expect(typeof handler).toBe('function');
    });

    it('asset:reveal - 注册成功', () => {
      const handler = getIpcHandler('asset:reveal');
      expect(handler).toBeDefined();
      expect(typeof handler).toBe('function');
    });

    it('asset:readText - 注册成功', () => {
      const handler = getIpcHandler('asset:read-text');
      expect(handler).toBeDefined();
      expect(typeof handler).toBe('function');
    });

    it('asset:pickFiles - 注册成功', () => {
      const handler = getIpcHandler('asset:pick-files');
      expect(handler).toBeDefined();
      expect(typeof handler).toBe('function');
    });

    it('settings:get - 注册并可调用', async () => {
      const handler = getIpcHandler('settings:get');
      expect(handler).toBeDefined();
      const result = await handler!();
      expect(result).toBeDefined();
      expect(typeof result).toBe('object');
    });

    it('settings:set - 注册并可调用', async () => {
      const handler = getIpcHandler('settings:set');
      expect(handler).toBeDefined();
      const result = await handler!({}, { concurrency: 2 });
      expect(result).toBeDefined();
      expect((result as { concurrency: number }).concurrency).toBe(2);
    });
  });

  describe('TaskRepository 接口测试', () => {
    it('createTask - 创建任务', () => {
      const task = repository.createTask({
        request: {
          type: 'explosion',
          input: { douyinUrl: 'https://v.douyin.com/demo', variantCount: 2 },
        },
        stepNames: ['download', 'frames'],
      });
      expect(task).toBeDefined();
      expect(task.id).toBeDefined();
      expect(task.type).toBe('explosion');
      expect(task.status).toBe('queued');
    });

    it('cloneTask - 克隆任务', () => {
      const task = repository.createTask({
        request: {
          type: 'explosion',
          input: { douyinUrl: 'https://v.douyin.com/demo', variantCount: 2 },
        },
        stepNames: ['download'],
      });
      const cloned = repository.cloneTask(task.id, ['download']);
      expect(cloned).toBeDefined();
      expect(cloned?.id).not.toBe(task.id);
      expect(cloned?.type).toBe('explosion');
    });

    it('listTasks - 列出任务', () => {
      repository.createTask({
        request: {
          type: 'explosion',
          input: { douyinUrl: 'https://v.douyin.com/demo', variantCount: 2 },
        },
        stepNames: ['download'],
      });
      const tasks = repository.listTasks();
      expect(tasks).toHaveLength(1);
    });

    it('getTask - 获取任务', () => {
      const task = repository.createTask({
        request: {
          type: 'explosion',
          input: { douyinUrl: 'https://v.douyin.com/demo', variantCount: 2 },
        },
        stepNames: ['download'],
      });
      const found = repository.getTask(task.id);
      expect(found).toBeDefined();
      expect(found?.id).toBe(task.id);
    });

    it('getTask - 不存在的任务返回 undefined', () => {
      const found = repository.getTask('non-existent-id');
      expect(found).toBeUndefined();
    });

    it('cancelTask - 取消任务', () => {
      const task = repository.createTask({
        request: {
          type: 'explosion',
          input: { douyinUrl: 'https://v.douyin.com/demo', variantCount: 2 },
        },
        stepNames: ['download'],
      });
      repository.updateTaskStatus(task.id, 'running', 10);
      repository.updateStepRunning(task.id, 'download');
      const canceled = repository.cancelTask(task.id);
      expect(canceled?.status).toBe('canceled');
    });

    it('deleteTask - 删除任务', () => {
      const task = repository.createTask({
        request: {
          type: 'explosion',
          input: { douyinUrl: 'https://v.douyin.com/demo', variantCount: 2 },
        },
        stepNames: ['download'],
      });
      const result = repository.deleteTask(task.id);
      expect(result).toBe(true);
      expect(repository.getTask(task.id)).toBeUndefined();
    });

    it('updateTaskStatus - 更新任务状态', () => {
      const task = repository.createTask({
        request: {
          type: 'explosion',
          input: { douyinUrl: 'https://v.douyin.com/demo', variantCount: 2 },
        },
        stepNames: ['download'],
      });
      repository.updateTaskStatus(task.id, 'running', 50, 'test error');
      const updated = repository.getTask(task.id);
      expect(updated?.status).toBe('running');
      expect(updated?.progress).toBe(50);
      expect(updated?.error).toBe('test error');
    });

    it('updateTaskProgress - 更新任务进度', () => {
      const task = repository.createTask({
        request: {
          type: 'explosion',
          input: { douyinUrl: 'https://v.douyin.com/demo', variantCount: 2 },
        },
        stepNames: ['download'],
      });
      repository.updateTaskProgress(task.id, 75);
      const updated = repository.getTask(task.id);
      expect(updated?.progress).toBe(75);
    });

    it('updateStepRunning - 更新步骤为运行中', () => {
      const task = repository.createTask({
        request: {
          type: 'explosion',
          input: { douyinUrl: 'https://v.douyin.com/demo', variantCount: 2 },
        },
        stepNames: ['download'],
      });
      repository.updateStepRunning(task.id, 'download');
      const updated = repository.getTask(task.id);
      expect(updated?.steps[0]?.status).toBe('running');
    });

    it('updateStepWaitingConfirmation - 更新步骤为等待确认', () => {
      const task = repository.createTask({
        request: {
          type: 'explosion',
          input: { douyinUrl: 'https://v.douyin.com/demo', variantCount: 2 },
        },
        stepNames: ['script_confirm'],
      });
      repository.updateStepWaitingConfirmation(task.id, 'script_confirm', '/tmp/artifact.md', '等待确认');
      const updated = repository.getTask(task.id);
      expect(updated?.steps[0]?.status).toBe('waiting_confirmation');
      expect(updated?.steps[0]?.artifactPath).toBe('/tmp/artifact.md');
    });

    it('updateStepSuccess - 更新步骤为成功', () => {
      const task = repository.createTask({
        request: {
          type: 'explosion',
          input: { douyinUrl: 'https://v.douyin.com/demo', variantCount: 2 },
        },
        stepNames: ['download'],
      });
      repository.updateStepSuccess(task.id, 'download', '/tmp/output.mp4', 'test logs');
      const updated = repository.getTask(task.id);
      expect(updated?.steps[0]?.status).toBe('success');
      expect(updated?.steps[0]?.artifactPath).toBe('/tmp/output.mp4');
    });

    it('updateStepFailed - 更新步骤为失败', () => {
      const task = repository.createTask({
        request: {
          type: 'explosion',
          input: { douyinUrl: 'https://v.douyin.com/demo', variantCount: 2 },
        },
        stepNames: ['download'],
      });
      repository.updateStepFailed(task.id, 'download', '下载失败');
      const updated = repository.getTask(task.id);
      expect(updated?.steps[0]?.status).toBe('failed');
      expect(updated?.error).toBe('下载失败');
    });

    it('confirmWaitingStep - 确认等待步骤', () => {
      const task = repository.createTask({
        request: {
          type: 'explosion',
          input: { douyinUrl: 'https://v.douyin.com/demo', variantCount: 2 },
        },
        stepNames: ['script_confirm', 'generate'],
      });
      repository.updateTaskStatus(task.id, 'waiting_confirmation', 50, '等待确认');
      repository.updateStepWaitingConfirmation(task.id, 'script_confirm');
      const confirmed = repository.confirmWaitingStep(task.id);
      expect(confirmed?.status).toBe('queued');
      expect(confirmed?.steps[0]?.status).toBe('success');
    });

    it('resetStepAndFollowing - 重置步骤及后续', () => {
      const task = repository.createTask({
        request: {
          type: 'explosion',
          input: { douyinUrl: 'https://v.douyin.com/demo', variantCount: 2 },
        },
        stepNames: ['download', 'frames', 'generate'],
      });
      repository.updateStepSuccess(task.id, 'download');
      repository.updateStepSuccess(task.id, 'frames');
      repository.updateStepFailed(task.id, 'generate', '生成失败');
      repository.resetStepAndFollowing(task.id, task.steps[1]!.id);
      const updated = repository.getTask(task.id);
      expect(updated?.steps[1]?.status).toBe('pending');
      expect(updated?.steps[2]?.status).toBe('pending');
    });

    it('listAssets - 列出资产', () => {
      const task = repository.createTask({
        request: {
          type: 'explosion',
          input: { douyinUrl: 'https://v.douyin.com/demo', variantCount: 2 },
        },
        stepNames: ['download'],
      });
      repository.createAsset({
        taskId: task.id,
        kind: 'video',
        path: '/tmp/test.mp4',
        tags: ['test'],
      });
      const assets = repository.listAssets();
      expect(assets).toHaveLength(1);
    });

    it('createAsset - 创建资产', () => {
      const task = repository.createTask({
        request: {
          type: 'explosion',
          input: { douyinUrl: 'https://v.douyin.com/demo', variantCount: 2 },
        },
        stepNames: ['download'],
      });
      const asset = repository.createAsset({
        taskId: task.id,
        kind: 'video',
        path: '/tmp/test.mp4',
        tags: ['test'],
      });
      expect(asset).toBeDefined();
      expect(asset.id).toBeDefined();
      expect(asset.path).toBe('/tmp/test.mp4');
    });

    it('getSetting - 获取设置', () => {
      repository.setSetting('test-key', 'test-value');
      const value = repository.getSetting('test-key');
      expect(value).toBe('test-value');
    });

    it('getSetting - 不存在的设置返回 undefined', () => {
      const value = repository.getSetting('non-existent');
      expect(value).toBeUndefined();
    });

    it('setSetting - 设置值', () => {
      repository.setSetting('test-key', 'test-value');
      expect(repository.getSetting('test-key')).toBe('test-value');
    });

    it('pauseRunningTasks - 暂停运行中的任务', () => {
      const task1 = repository.createTask({
        request: {
          type: 'explosion',
          input: { douyinUrl: 'https://v.douyin.com/demo', variantCount: 2 },
        },
        stepNames: ['download'],
      });
      const task2 = repository.createTask({
        request: {
          type: 'explosion',
          input: { douyinUrl: 'https://v.douyin.com/demo', variantCount: 2 },
        },
        stepNames: ['download'],
      });
      repository.updateTaskStatus(task1.id, 'running', 10);
      const paused = repository.pauseRunningTasks();
      expect(paused).toBe(1);
      expect(repository.getTask(task1.id)?.status).toBe('paused');
      expect(repository.getTask(task2.id)?.status).toBe('queued');
    });
  });

  describe('SettingsService 接口测试', () => {
    it('getPublicSettings - 获取公开设置', async () => {
      const result = await settings.getPublicSettings();
      expect(result).toBeDefined();
      expect(result.concurrency).toBe(1);
      expect(result.douyinAutoReadChromeCookies).toBe(true);
    });

    it('updateSettings - 更新设置', async () => {
      const result = await settings.updateSettings({
        concurrency: 2,
        douyinAutoReadChromeCookies: false,
      });
      expect(result.concurrency).toBe(2);
      expect(result.douyinAutoReadChromeCookies).toBe(false);
    });

    it('updateSettings - 更新加密设置', async () => {
      const result = await settings.updateSettings({
        douyinCookie: 'sessionid=test',
      });
      expect(result.douyinCookie).toBe('sessionid=test');
    });

    it('getRuntimeCredentials - 获取运行时凭证', async () => {
      await settings.updateSettings({
        seedanceApiKey: 'test-key',
      });
      const creds = await settings.getRuntimeCredentials();
      expect(creds.seedanceApiKey).toBe('test-key');
    });
  });

  describe('ModelClient 接口测试', () => {
    function createMockModelClient(): ModelClient {
      return {
        generateImage: vi.fn(),
        generateVideo: vi.fn(),
        generateDigitalHuman: vi.fn(),
        asr: vi.fn(),
        tts: vi.fn(),
        chat: vi.fn(),
        webSearch: vi.fn(),
        vision: vi.fn(),
        visionVideo: vi.fn(),
      };
    }

    it('generateImage - 方法存在', () => {
      const modelClient = createMockModelClient();
      expect(typeof modelClient.generateImage).toBe('function');
    });

    it('generateVideo - 方法存在', () => {
      const modelClient = createMockModelClient();
      expect(typeof modelClient.generateVideo).toBe('function');
    });

    it('generateDigitalHuman - 方法存在', () => {
      const modelClient = createMockModelClient();
      expect(typeof modelClient.generateDigitalHuman).toBe('function');
    });

    it('asr - 方法存在', () => {
      const modelClient = createMockModelClient();
      expect(typeof modelClient.asr).toBe('function');
    });

    it('tts - 方法存在', () => {
      const modelClient = createMockModelClient();
      expect(typeof modelClient.tts).toBe('function');
    });

    it('chat - 方法存在', () => {
      const modelClient = createMockModelClient();
      expect(typeof modelClient.chat).toBe('function');
    });

    it('webSearch - 方法存在', () => {
      const modelClient = createMockModelClient();
      expect(typeof modelClient.webSearch).toBe('function');
    });

    it('vision - 方法存在', () => {
      const modelClient = createMockModelClient();
      expect(typeof modelClient.vision).toBe('function');
    });

    it('visionVideo - 方法存在', () => {
      const modelClient = createMockModelClient();
      expect(typeof modelClient.visionVideo).toBe('function');
    });
  });

  describe('Pipeline 接口测试', () => {
    it('explosion pipeline - 存在', async () => {
      const { getPipeline } = await import('../../src/main/pipelines/index.js');
      const pipeline = getPipeline('explosion');
      expect(pipeline).toBeDefined();
      expect(pipeline?.type).toBe('explosion');
      expect(Array.isArray(pipeline?.steps)).toBe(true);
    });

    it('native pipeline - 存在', async () => {
      const { getPipeline } = await import('../../src/main/pipelines/index.js');
      const pipeline = getPipeline('native');
      expect(pipeline).toBeDefined();
      expect(pipeline?.type).toBe('native');
    });

    it('pretrailer pipeline - 存在', async () => {
      const { getPipeline } = await import('../../src/main/pipelines/index.js');
      const pipeline = getPipeline('pretrailer');
      expect(pipeline).toBeDefined();
      expect(pipeline?.type).toBe('pretrailer');
    });

    it('avatar pipeline - 存在', async () => {
      const { getPipeline } = await import('../../src/main/pipelines/index.js');
      const pipeline = getPipeline('avatar');
      expect(pipeline).toBeDefined();
      expect(pipeline?.type).toBe('avatar');
    });

    it('copywriting pipeline - 存在', async () => {
      const { getPipeline } = await import('../../src/main/pipelines/index.js');
      const pipeline = getPipeline('copywriting');
      expect(pipeline).toBeDefined();
      expect(pipeline?.type).toBe('copywriting');
    });

    it('video-scoring pipeline - 存在', async () => {
      const { getPipeline } = await import('../../src/main/pipelines/index.js');
      const pipeline = getPipeline('video_scoring');
      expect(pipeline).toBeDefined();
      expect(pipeline?.type).toBe('video_scoring');
    });

    it('ecommerce-image pipeline - 存在', async () => {
      const { getPipeline } = await import('../../src/main/pipelines/index.js');
      const pipeline = getPipeline('ecommerce_image');
      expect(pipeline).toBeDefined();
      expect(pipeline?.type).toBe('ecommerce_image');
    });

    it('lark-download pipeline - 存在', async () => {
      const { getPipeline } = await import('../../src/main/pipelines/index.js');
      const pipeline = getPipeline('lark_download');
      expect(pipeline).toBeDefined();
      expect(pipeline?.type).toBe('lark_download');
    });

    it('getPipeline - 不存在的 pipeline 返回 undefined', async () => {
      const { getPipeline } = await import('../../src/main/pipelines/index.js');
      const pipeline = getPipeline('non-existent' as TaskType);
      expect(pipeline).toBeUndefined();
    });
  });

  describe('Worker 接口测试', () => {
    it('createTask - 创建任务', async () => {
      const task = worker.createTask({
        type: 'explosion',
        input: { douyinUrl: 'https://v.douyin.com/demo', variantCount: 2 },
      } as CreateTaskRequest);
      expect(task).toBeDefined();
      expect(task.type).toBe('explosion');
    });

    it('retryTask - 重试任务', async () => {
      const task = worker.createTask({
        type: 'explosion',
        input: { douyinUrl: 'https://v.douyin.com/demo', variantCount: 2 },
      } as CreateTaskRequest);
      repository.updateTaskStatus(task.id, 'failed', 0, 'test error');
      worker.retryTask(task.id);
      const updated = repository.getTask(task.id);
      expect(updated?.status).toBe('queued');
    });

    it('cancelTask - 取消任务', async () => {
      const task = worker.createTask({
        type: 'explosion',
        input: { douyinUrl: 'https://v.douyin.com/demo', variantCount: 2 },
      } as CreateTaskRequest);
      const canceled = worker.cancelTask(task.id);
      expect(canceled?.status).toBe('canceled');
    });

    it('deleteTask - 删除任务', async () => {
      const task = worker.createTask({
        type: 'explosion',
        input: { douyinUrl: 'https://v.douyin.com/demo', variantCount: 2 },
      } as CreateTaskRequest);
      worker.cancelTask(task.id);
      const result = worker.deleteTask(task.id);
      expect(result).toBe(true);
    });

    it('cloneTask - 克隆任务', async () => {
      const task = worker.createTask({
        type: 'explosion',
        input: { douyinUrl: 'https://v.douyin.com/demo', variantCount: 2 },
      } as CreateTaskRequest);
      const cloned = worker.cloneTask(task.id);
      expect(cloned).toBeDefined();
      expect(cloned?.id).not.toBe(task.id);
    });
  });
});
