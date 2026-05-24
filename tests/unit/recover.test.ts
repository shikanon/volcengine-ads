import { describe, expect, it } from 'vitest';

import { pauseRunningTasks } from '../../src/main/queue/recover.js';
import type { TaskRepository } from '../../src/main/db/index.js';

describe('pauseRunningTasks', () => {
  it('delegates running to paused recovery to repository', () => {
    const repository = {
      pauseRunningTasks: () => 2,
    } as TaskRepository;

    expect(pauseRunningTasks(repository)).toBe(2);
  });
});
