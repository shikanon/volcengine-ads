import { mkdtempSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { SqliteTaskRepository } from '../../src/main/db/index.js';
import { AppError } from '../../src/main/errors.js';
import type { ModelClient } from '../../src/main/model-client/index.js';
import type { PipelineDefinition } from '../../src/main/pipelines/types.js';
import { runPipeline } from '../../src/main/pipelines/runner.js';
import type { ExplosionInput } from '../../src/shared/types.js';

describe('pipeline logging', () => {
  it('writes a task log file and exposes its path on step failure', async () => {
    const userDataPath = mkdtempSync(join(tmpdir(), 'pipeline-logging-'));
    const repository = new SqliteTaskRepository(join(userDataPath, 'app.db'));
    const pipeline: PipelineDefinition<ExplosionInput> = {
      type: 'explosion',
      steps: [
        {
          name: 'fail_step',
          async runStep(ctx) {
            await ctx.appendLog?.('info', '准备执行失败节点', { reason: 'unit-test' });
            throw new AppError('E_INPUT_VALIDATION', '视频时长超过模型单次限制');
          },
        },
      ],
    };
    const task = repository.createTask({
      request: {
        type: 'explosion',
        input: { douyinUrl: 'https://v.douyin.com/demo', variantCount: 1 },
      },
      stepNames: pipeline.steps.map((step) => step.name),
    });

    await expect(
      runPipeline({
        task,
        pipeline,
        repository,
        modelClient: {} as ModelClient,
        workflowPrompts: {},
        userDataPath,
        emitProgress: () => undefined,
      }),
    ).rejects.toThrow(AppError);

    const logFilePath = join(userDataPath, 'artifacts', task.id, 'pipeline.log');
    const failed = repository.getTask(task.id);
    expect(failed?.status).toBe('paused');
    expect(failed?.error).toContain('任务执行失败：输入参数不合法：视频时长超过模型单次限制');
    expect(failed?.error).toContain('可能原因：输入素材或参数不符合当前工作流要求。');
    expect(failed?.error).toContain(
      '建议处理：请检查输入链接、文件路径、时长、比例、行业类型和必填字段，修改后重新创建或重试任务。',
    );
    expect(failed?.error).toContain('错误类型：输入参数不合法');
    expect(failed?.error).toContain(`日志文件：${logFilePath}`);
    expect(failed?.steps[0]?.logs).toContain('建议处理：请检查输入链接');
    expect(failed?.steps[0]?.logs).toContain(`日志文件：${logFilePath}`);

    const lines = (await readFile(logFilePath, 'utf8')).trim().split('\n');
    expect(lines.map((line) => JSON.parse(line) as { message: string })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: '任务开始执行' }),
        expect.objectContaining({ message: '节点开始执行' }),
        expect.objectContaining({ message: '准备执行失败节点' }),
        expect.objectContaining({ message: '节点执行失败' }),
      ]),
    );
    expect(JSON.parse(lines.at(-1) ?? '{}')).toMatchObject({
      level: 'error',
      code: 'E_INPUT_VALIDATION',
      errorType: '输入参数不合法',
    });
  });

  it('emits artifactPath and logs when a step succeeds', async () => {
    const userDataPath = mkdtempSync(join(tmpdir(), 'pipeline-progress-'));
    const repository = new SqliteTaskRepository(join(userDataPath, 'app.db'));
    const pipeline: PipelineDefinition<ExplosionInput> = {
      type: 'explosion',
      steps: [
        {
          name: 'success_step',
          async runStep() {
            return {
              artifactPath: join(userDataPath, 'artifacts', 'demo.json'),
              logs: '节点输出已就绪',
            };
          },
        },
      ],
    };
    const task = repository.createTask({
      request: {
        type: 'explosion',
        input: { douyinUrl: 'https://v.douyin.com/demo', variantCount: 1 },
      },
      stepNames: pipeline.steps.map((step) => step.name),
    });
    const emitProgress = vi.fn();

    await runPipeline({
      task,
      pipeline,
      repository,
      modelClient: {} as ModelClient,
      workflowPrompts: {},
      userDataPath,
      emitProgress,
    });

    expect(emitProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: task.id,
        status: 'running',
        step: 'success_step',
        refreshOutputs: true,
        artifactPath: join(userDataPath, 'artifacts', 'demo.json'),
        logs: '节点输出已就绪',
      }),
    );
  });

  it('uses step canResume to skip completed steps without a single artifact path', async () => {
    const userDataPath = mkdtempSync(join(tmpdir(), 'pipeline-resume-contract-'));
    const repository = new SqliteTaskRepository(join(userDataPath, 'app.db'));
    const runStep = vi.fn(async () => ({ logs: '复合产物已就绪' }));
    const canResume = vi.fn(() => true);
    const pipeline: PipelineDefinition<ExplosionInput> = {
      type: 'explosion',
      steps: [{ name: 'compound_step', canResume, runStep }],
    };
    const task = repository.createTask({
      request: {
        type: 'explosion',
        input: { douyinUrl: 'https://v.douyin.com/demo', variantCount: 1 },
      },
      stepNames: pipeline.steps.map((step) => step.name),
    });

    await runPipeline({
      task,
      pipeline,
      repository,
      modelClient: {} as ModelClient,
      workflowPrompts: {},
      userDataPath,
      emitProgress: () => undefined,
    });
    await runPipeline({
      task,
      pipeline,
      repository,
      modelClient: {} as ModelClient,
      workflowPrompts: {},
      userDataPath,
      emitProgress: () => undefined,
    });

    expect(runStep).toHaveBeenCalledTimes(1);
    expect(canResume).toHaveBeenCalledTimes(1);
    const logFilePath = join(userDataPath, 'artifacts', task.id, 'pipeline.log');
    await expect(readFile(logFilePath, 'utf8')).resolves.toContain('节点已完成，续跑时跳过');
  });

  it('reruns a completed step when the default artifact path is missing', async () => {
    const userDataPath = mkdtempSync(join(tmpdir(), 'pipeline-missing-artifact-'));
    const repository = new SqliteTaskRepository(join(userDataPath, 'app.db'));
    const missingArtifactPath = join(userDataPath, 'artifacts', 'missing.json');
    const runStep = vi.fn(async () => ({ artifactPath: missingArtifactPath }));
    const pipeline: PipelineDefinition<ExplosionInput> = {
      type: 'explosion',
      steps: [{ name: 'single_artifact_step', runStep }],
    };
    const task = repository.createTask({
      request: {
        type: 'explosion',
        input: { douyinUrl: 'https://v.douyin.com/demo', variantCount: 1 },
      },
      stepNames: pipeline.steps.map((step) => step.name),
    });

    await runPipeline({
      task,
      pipeline,
      repository,
      modelClient: {} as ModelClient,
      workflowPrompts: {},
      userDataPath,
      emitProgress: () => undefined,
    });
    await runPipeline({
      task,
      pipeline,
      repository,
      modelClient: {} as ModelClient,
      workflowPrompts: {},
      userDataPath,
      emitProgress: () => undefined,
    });

    expect(runStep).toHaveBeenCalledTimes(2);
  });
});
