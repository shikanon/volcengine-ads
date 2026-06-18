import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

import Database from 'better-sqlite3';

import type {
  AssetRecord,
  CreateTaskRequest,
  TaskRecord,
  TaskStatus,
  TaskStep,
} from '../../shared/types.js';
import type { AssetRow, SettingRow, TaskRow, TaskStepRow } from './schema.js';

const INITIAL_MIGRATION_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS tasks (
  id           TEXT PRIMARY KEY,
  type         TEXT NOT NULL,
  status       TEXT NOT NULL,
  progress     INTEGER NOT NULL DEFAULT 0,
  input_json   TEXT NOT NULL,
  error        TEXT,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS task_steps (
  id            TEXT PRIMARY KEY,
  task_id       TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  step          TEXT NOT NULL,
  status        TEXT NOT NULL,
  artifact_path TEXT,
  logs          TEXT,
  started_at    INTEGER,
  finished_at   INTEGER
);

CREATE TABLE IF NOT EXISTS assets (
  id         TEXT PRIMARY KEY,
  task_id    TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  kind       TEXT NOT NULL,
  path       TEXT NOT NULL,
  thumbnail  TEXT,
  duration   REAL,
  tags       TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS avatars (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  image_path TEXT NOT NULL,
  source     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_steps_task ON task_steps(task_id, step);
`;

export interface CreateTaskWithSteps {
  request: CreateTaskRequest;
  stepNames: string[];
}

export interface TaskRepository {
  createTask(params: CreateTaskWithSteps): TaskRecord;
  cloneTask(taskId: string, stepNames: string[]): TaskRecord | undefined;
  listTasks(): TaskRecord[];
  getTask(taskId: string): TaskRecord | undefined;
  cancelTask(taskId: string): TaskRecord | undefined;
  deleteTask(taskId: string): boolean;
  updateTaskStatus(taskId: string, status: TaskStatus, progress: number, error?: string): void;
  updateTaskProgress(taskId: string, progress: number): void;
  updateStepRunning(taskId: string, step: string): void;
  updateStepWaitingConfirmation(taskId: string, step: string, artifactPath?: string, logs?: string): void;
  updateStepSuccess(taskId: string, step: string, artifactPath?: string, logs?: string): void;
  updateStepFailed(taskId: string, step: string, error: string): void;
  confirmWaitingStep(taskId: string): TaskRecord | undefined;
  resetStepAndFollowing(taskId: string, stepId: string): void;
  listAssets(): AssetRecord[];
  createAsset(asset: Omit<AssetRecord, 'id' | 'createdAt'>): AssetRecord;
  getSetting(key: string): string | undefined;
  setSetting(key: string, value: string): void;
  pauseRunningTasks(): number;
}

function optional<T extends string | number>(value: T | null): T | undefined {
  return value === null ? undefined : value;
}

function parseTags(value: string | null): string[] {
  if (!value) {
    return [];
  }
  const parsed: unknown = JSON.parse(value);
  return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
}

function mapStep(row: TaskStepRow): TaskStep {
  const step: TaskStep = {
    id: row.id,
    step: row.step,
    status: row.status,
  };
  const artifactPath = optional(row.artifact_path);
  const logs = optional(row.logs);
  const startedAt = optional(row.started_at);
  const finishedAt = optional(row.finished_at);
  if (artifactPath !== undefined) step.artifactPath = artifactPath;
  if (logs !== undefined) step.logs = logs;
  if (startedAt !== undefined) step.startedAt = startedAt;
  if (finishedAt !== undefined) step.finishedAt = finishedAt;
  return step;
}

function mapTask(row: TaskRow, steps: TaskStep[]): TaskRecord {
  const input = JSON.parse(row.input_json) as TaskRecord['input'];
  const task: TaskRecord = {
    id: row.id,
    type: row.type,
    status: row.status,
    progress: row.progress,
    input,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    steps,
  };
  if (row.error !== null) {
    task.error = row.error;
  }
  return task;
}

function mapAsset(row: AssetRow): AssetRecord {
  const asset: AssetRecord = {
    id: row.id,
    kind: row.kind,
    path: row.path,
    tags: parseTags(row.tags),
    createdAt: row.created_at,
  };
  const taskId = optional(row.task_id);
  const thumbnail = optional(row.thumbnail);
  const duration = optional(row.duration);
  if (taskId !== undefined) asset.taskId = taskId;
  if (thumbnail !== undefined) asset.thumbnail = thumbnail;
  if (duration !== undefined) asset.duration = duration;
  return asset;
}

export class SqliteTaskRepository implements TaskRepository {
  private readonly db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('foreign_keys = ON');
    this.migrate();
  }

  createTask(params: CreateTaskWithSteps): TaskRecord {
    const now = Date.now();
    const id = randomUUID();
    const transaction = this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO tasks (id, type, status, progress, input_json, created_at, updated_at)
           VALUES (@id, @type, 'queued', 0, @inputJson, @createdAt, @updatedAt)`,
        )
        .run({
          id,
          type: params.request.type,
          inputJson: JSON.stringify(params.request.input),
          createdAt: now,
          updatedAt: now,
        });
      const insertStep = this.db.prepare(
        `INSERT INTO task_steps (id, task_id, step, status)
         VALUES (@id, @taskId, @step, 'pending')`,
      );
      for (const step of params.stepNames) {
        insertStep.run({ id: randomUUID(), taskId: id, step });
      }
    });
    transaction();
    const created = this.getTask(id);
    if (!created) {
      throw new Error('Task creation failed');
    }
    return created;
  }

  cloneTask(taskId: string, stepNames: string[]): TaskRecord | undefined {
    const source = this.getTask(taskId);
    if (!source) {
      return undefined;
    }
    return this.createTask({
      request: { type: source.type, input: source.input },
      stepNames,
    });
  }

  listTasks(): TaskRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM tasks ORDER BY created_at DESC')
      .all() as TaskRow[];
    return rows.map((row) => mapTask(row, this.getSteps(row.id)));
  }

  getTask(taskId: string): TaskRecord | undefined {
    const row = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as TaskRow | undefined;
    return row ? mapTask(row, this.getSteps(row.id)) : undefined;
  }

  cancelTask(taskId: string): TaskRecord | undefined {
    const task = this.getTask(taskId);
    if (!task) {
      return undefined;
    }
    if (task.status === 'success' || task.status === 'canceled') {
      return task;
    }
    const now = Date.now();
    const transaction = this.db.transaction(() => {
      this.db
        .prepare(
          `UPDATE tasks
           SET status = 'canceled', error = ?, updated_at = ?
           WHERE id = ?`,
        )
        .run('任务已取消', now, taskId);
      this.db
        .prepare(
          `UPDATE task_steps
           SET status = 'canceled', logs = ?, finished_at = ?
           WHERE task_id = ? AND status = 'running'`,
        )
        .run('任务已取消', now, taskId);
    });
    transaction();
    return this.getTask(taskId);
  }

  deleteTask(taskId: string): boolean {
    const result = this.db.prepare('DELETE FROM tasks WHERE id = ?').run(taskId);
    return result.changes > 0;
  }

  updateTaskStatus(taskId: string, status: TaskStatus, progress: number, error?: string): void {
    this.db
      .prepare(
        `UPDATE tasks
         SET status = ?, progress = ?, error = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(status, progress, error ?? null, Date.now(), taskId);
  }

  updateTaskProgress(taskId: string, progress: number): void {
    this.db
      .prepare('UPDATE tasks SET progress = ?, updated_at = ? WHERE id = ?')
      .run(progress, Date.now(), taskId);
  }

  updateStepRunning(taskId: string, step: string): void {
    this.db
      .prepare(
        `UPDATE task_steps
         SET status = 'running', started_at = ?, logs = NULL
         WHERE task_id = ? AND step = ?`,
      )
      .run(Date.now(), taskId, step);
  }

  updateStepWaitingConfirmation(taskId: string, step: string, artifactPath?: string, logs?: string): void {
    this.db
      .prepare(
        `UPDATE task_steps
         SET status = 'waiting_confirmation',
             artifact_path = COALESCE(?, artifact_path),
             logs = ?,
             finished_at = NULL
         WHERE task_id = ? AND step = ?`,
      )
      .run(artifactPath ?? null, logs ?? null, taskId, step);
  }

  updateStepSuccess(taskId: string, step: string, artifactPath?: string, logs?: string): void {
    this.db
      .prepare(
        `UPDATE task_steps
         SET status = 'success', artifact_path = COALESCE(?, artifact_path), logs = ?, finished_at = ?
         WHERE task_id = ? AND step = ?`,
      )
      .run(artifactPath ?? null, logs ?? null, Date.now(), taskId, step);
  }

  updateStepFailed(taskId: string, step: string, error: string): void {
    const now = Date.now();
    const transaction = this.db.transaction(() => {
      this.db
        .prepare(
          `UPDATE task_steps
           SET status = 'failed', logs = ?, finished_at = ?
           WHERE task_id = ? AND step = ?`,
        )
        .run(error, now, taskId, step);
      this.db
        .prepare(
          `UPDATE tasks
           SET status = 'failed', error = ?, updated_at = ?
           WHERE id = ?`,
        )
        .run(error, now, taskId);
    });
    transaction();
  }

  confirmWaitingStep(taskId: string): TaskRecord | undefined {
    const task = this.getTask(taskId);
    if (!task || task.status !== 'waiting_confirmation') {
      return undefined;
    }
    const step = task.steps.find((item) => item.status === 'waiting_confirmation');
    if (!step) {
      return undefined;
    }
    const now = Date.now();
    const transaction = this.db.transaction(() => {
      this.db
        .prepare(
          `UPDATE task_steps
           SET status = 'success', logs = ?, finished_at = ?
           WHERE id = ?`,
        )
        .run('脚本文案已确认', now, step.id);
      this.db
        .prepare(
          `UPDATE tasks
           SET status = 'queued', error = NULL, updated_at = ?
           WHERE id = ?`,
        )
        .run(now, taskId);
    });
    transaction();
    return this.getTask(taskId);
  }

  resetStepAndFollowing(taskId: string, stepId: string): void {
    const steps = this.getSteps(taskId);
    const index = steps.findIndex((step) => step.id === stepId);
    if (index === -1) {
      return;
    }
    const names = steps.slice(index).map((step) => step.step);
    const transaction = this.db.transaction(() => {
      for (const step of names) {
        this.db
          .prepare(
            `UPDATE task_steps
             SET status = 'pending', artifact_path = NULL, logs = NULL, started_at = NULL, finished_at = NULL
             WHERE task_id = ? AND step = ?`,
          )
          .run(taskId, step);
      }
      this.updateTaskStatus(taskId, 'queued', Math.max(0, Math.floor((index / steps.length) * 100)));
    });
    transaction();
  }

  listAssets(): AssetRecord[] {
    const rows = this.db.prepare('SELECT * FROM assets ORDER BY created_at DESC').all() as AssetRow[];
    return rows.map(mapAsset);
  }

  createAsset(asset: Omit<AssetRecord, 'id' | 'createdAt'>): AssetRecord {
    const id = randomUUID();
    const createdAt = Date.now();
    this.db
      .prepare(
        `INSERT INTO assets (id, task_id, kind, path, thumbnail, duration, tags, created_at)
         VALUES (@id, @taskId, @kind, @path, @thumbnail, @duration, @tags, @createdAt)`,
      )
      .run({
        id,
        taskId: asset.taskId ?? null,
        kind: asset.kind,
        path: asset.path,
        thumbnail: asset.thumbnail ?? null,
        duration: asset.duration ?? null,
        tags: JSON.stringify(asset.tags),
        createdAt,
      });
    return { ...asset, id, createdAt };
  }

  getSetting(key: string): string | undefined {
    const row = this.db.prepare('SELECT * FROM settings WHERE key = ?').get(key) as SettingRow | undefined;
    return row?.value;
  }

  setSetting(key: string, value: string): void {
    this.db
      .prepare(
        `INSERT INTO settings (key, value)
         VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run(key, value);
  }

  pauseRunningTasks(): number {
    const result = this.db
      .prepare(
        `UPDATE tasks
         SET status = 'paused', updated_at = ?
         WHERE status = 'running'`,
      )
      .run(Date.now());
    return result.changes;
  }

  private migrate(): void {
    this.db.exec(INITIAL_MIGRATION_SQL);
  }

  private getSteps(taskId: string): TaskStep[] {
    const rows = this.db
      .prepare('SELECT * FROM task_steps WHERE task_id = ? ORDER BY rowid ASC')
      .all(taskId) as TaskStepRow[];
    return rows.map(mapStep);
  }
}

export async function createRepository(userDataPath: string): Promise<SqliteTaskRepository> {
  const dbPath = join(userDataPath, 'aigc.db');
  await mkdir(dirname(dbPath), { recursive: true });
  return new SqliteTaskRepository(dbPath);
}
