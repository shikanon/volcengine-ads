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
    expect(failed?.error).toContain('错误类型：输入参数不合法');
    expect(failed?.error).toContain(`日志文件：${logFilePath}`);
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
});
