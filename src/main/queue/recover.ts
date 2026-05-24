import type { TaskRepository } from '../db/index.js';

export function pauseRunningTasks(repository: TaskRepository): number {
  return repository.pauseRunningTasks();
}
