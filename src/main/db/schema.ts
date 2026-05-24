import type { AssetKind, StepStatus, TaskStatus, TaskType } from '../../shared/types.js';

export interface TaskRow {
  id: string;
  type: TaskType;
  status: TaskStatus;
  progress: number;
  input_json: string;
  error: string | null;
  created_at: number;
  updated_at: number;
}

export interface TaskStepRow {
  id: string;
  task_id: string;
  step: string;
  status: StepStatus;
  artifact_path: string | null;
  logs: string | null;
  started_at: number | null;
  finished_at: number | null;
}

export interface AssetRow {
  id: string;
  task_id: string | null;
  kind: AssetKind;
  path: string;
  thumbnail: string | null;
  duration: number | null;
  tags: string | null;
  created_at: number;
}

export interface AvatarRow {
  id: string;
  name: string;
  image_path: string;
  source: 'builtin' | 'user';
}

export interface SettingRow {
  key: string;
  value: string;
}
