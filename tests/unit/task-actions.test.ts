import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { SqliteTaskRepository } from '../../src/main/db/index.js';

function createRepository(): SqliteTaskRepository {
  return new SqliteTaskRepository(join(mkdtempSync(join(tmpdir(), 'task-actions-')), 'app.db'));
}

describe('task actions', () => {
  it('cancels a running task and marks the running step canceled', () => {
    const repository = createRepository();
    const task = repository.createTask({
      request: {
        type: 'explosion',
        input: { douyinUrl: 'https://v.douyin.com/demo', variantCount: 2 },
      },
      stepNames: ['download', 'frames'],
    });

    repository.updateTaskStatus(task.id, 'running', 10);
    repository.updateStepRunning(task.id, 'download');

    const canceled = repository.cancelTask(task.id);

    expect(canceled?.status).toBe('canceled');
    expect(canceled?.error).toBe('任务已取消');
    expect(canceled?.steps[0]).toMatchObject({
      step: 'download',
      status: 'canceled',
      logs: '任务已取消',
    });
  });

  it('clones a task into a queued task with fresh steps', () => {
    const repository = createRepository();
    const task = repository.createTask({
      request: {
        type: 'explosion',
        input: { douyinUrl: 'https://v.douyin.com/demo', variantCount: 2 },
      },
      stepNames: ['download', 'frames'],
    });

    const clone = repository.cloneTask(task.id, ['download', 'frames']);

    expect(clone).toMatchObject({
      type: task.type,
      status: 'queued',
      progress: 0,
      input: task.input,
    });
    expect(clone?.id).not.toBe(task.id);
    expect(clone?.steps.map((step) => step.status)).toEqual(['pending', 'pending']);
  });

  it('deletes a task record', () => {
    const repository = createRepository();
    const task = repository.createTask({
      request: {
        type: 'explosion',
        input: { douyinUrl: 'https://v.douyin.com/demo', variantCount: 2 },
      },
      stepNames: ['download'],
    });

    expect(repository.deleteTask(task.id)).toBe(true);
    expect(repository.getTask(task.id)).toBeUndefined();
  });
});
