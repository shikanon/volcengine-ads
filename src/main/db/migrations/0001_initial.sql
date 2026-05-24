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
