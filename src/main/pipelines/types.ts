import type { ModelClient } from '../model-client/index.js';
import type { TaskRepository } from '../db/index.js';
import type {
  AvatarInput,
  CopywritingInput,
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

export type PipelineInput =
  | ExplosionInput
  | PretrailerInput
  | AvatarInput
  | NativeInput
  | CopywritingInput;

export interface StepContext<TInput = PipelineInput> {
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

export interface PipelineStep<TInput = PipelineInput> {
  name: string;
  runStep(ctx: StepContext<TInput>): Promise<StepResult>;
}

export interface PipelineDefinition<TInput = PipelineInput> {
  type: TaskType;
  steps: PipelineStep<TInput>[];
}
