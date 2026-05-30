import type { ModelClient } from '../model-client/index.js';
import type { TaskRepository } from '../db/index.js';
import type {
  AvatarInput,
  ExplosionInput,
  NativeInput,
  PretrailerInput,
  TaskProgressEvent,
  TaskRecord,
  TaskType,
} from '../../shared/types.js';
import type { WorkflowPromptOverrides } from '../../shared/workflows.js';

export interface StepResult {
  artifactPath?: string;
  logs?: string;
  awaitingConfirmation?: {
    message: string;
  };
}

export interface StepContext<TInput = ExplosionInput | PretrailerInput | AvatarInput | NativeInput> {
  task: TaskRecord;
  input: TInput;
  artifactDir: string;
  logFilePath?: string;
  repository: TaskRepository;
  modelClient: ModelClient;
  workflowPrompts: WorkflowPromptOverrides;
  emitProgress(event: TaskProgressEvent): void;
  appendLog?(level: 'info' | 'warn' | 'error', message: string, data?: Record<string, unknown>): Promise<void>;
}

export interface PipelineStep<TInput = ExplosionInput | PretrailerInput | AvatarInput | NativeInput> {
  name: string;
  runStep(ctx: StepContext<TInput>): Promise<StepResult>;
}

export interface PipelineDefinition<TInput = ExplosionInput | PretrailerInput | AvatarInput | NativeInput> {
  type: TaskType;
  steps: PipelineStep<TInput>[];
}
