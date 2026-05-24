import type { RuntimeCredentials } from '../secure/keystore.js';

export interface ModelClient {
  generateVideo(req: SeedanceVideoRequest): Promise<VideoResult>;
  generateDigitalHuman(req: SeedanceAvatarRequest): Promise<VideoResult>;
  asr(audioPath: string): Promise<TranscriptResult>;
  tts(text: string, voice: string): Promise<AudioResult>;
  chat(messages: ChatMessage[], opts?: ChatOptions): Promise<string>;
  vision(images: string[], prompt: string): Promise<string>;
}

export interface SeedanceVideoRequest {
  refVideoPath?: string;
  refImagePaths?: string[];
  prompt: string;
  durationSec?: number;
  resolution?: string;
  outputPath: string;
}

export interface SeedanceAvatarRequest {
  audioPath: string;
  avatarImagePath: string;
  durationSec?: number;
  outputPath: string;
}

export interface VideoResult {
  localPath: string;
  duration: number;
  lipSyncOffsetMs?: number;
}

export interface AudioResult {
  localPath: string;
  duration: number;
}

export interface TranscriptResult {
  text: string;
  segments: TranscriptSegment[];
}

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  temperature?: number;
  jsonSchema?: object;
}

export interface ModelClientFactory {
  create(): Promise<ModelClient>;
}

export type RuntimeCredentialsLoader = () => Promise<RuntimeCredentials>;
