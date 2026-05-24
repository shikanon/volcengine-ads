import type { ModelClient } from '../model-client/index.js';
import type { TaskRepository } from '../db/index.js';
import type {
  AvatarInput,
  ExplosionInput,
  PretrailerInput,
  TaskProgressEvent,
  TaskRecord,
  TaskType,
} from '../../shared/types.js';

export interface StepResult {
  artifactPath?: string;
  logs?: string;
}

export interface StepContext<TInput = ExplosionInput | PretrailerInput | AvatarInput> {
  task: TaskRecord;
  input: TInput;
  artifactDir: string;
  repository: TaskRepository;
  modelClient: ModelClient;
  emitProgress(event: TaskProgressEvent): void;
}

export interface PipelineStep<TInput = ExplosionInput | PretrailerInput | AvatarInput> {
  name: string;
  runStep(ctx: StepContext<TInput>): Promise<StepResult>;
}

export interface PipelineDefinition<TInput = ExplosionInput | PretrailerInput | AvatarInput> {
  type: TaskType;
  steps: PipelineStep<TInput>[];
}
