import type { RuntimeCredentials } from '../secure/keystore.js';

export interface ModelClient {
  generateImage(req: SeedreamImageRequest): Promise<ImageResult>;
  generateVideo(req: SeedanceVideoRequest): Promise<VideoResult>;
  generateDigitalHuman(req: SeedanceAvatarRequest): Promise<VideoResult>;
  asr(audioPath: string): Promise<TranscriptResult>;
  tts(text: string, voice?: string): Promise<AudioResult>;
  chat(messages: ChatMessage[], opts?: ChatOptions): Promise<string>;
  vision(images: string[], prompt: string, opts?: VisionOptions): Promise<string>;
  visionVideo(videoPath: string, prompt: string, opts?: VisionOptions): Promise<string>;
}

export interface SeedreamImageRequest {
  refImagePath: string;
  prompt: string;
  outputPath: string;
  size?: string;
}

export interface SeedanceVideoRequest {
  refVideoPath?: string;
  refImagePaths?: string[];
  audioPath?: string;
  prompt: string;
  durationSec?: number;
  resolution?: string;
  ratio?: string;
  generateAudio?: boolean;
  outputPath: string;
}

export interface SeedanceAvatarRequest {
  audioPath: string;
  avatarImagePath: string;
  prompt?: string;
  durationSec?: number;
  resolution?: string;
  generateAudio?: boolean;
  outputPath: string;
}

export interface VideoResult {
  localPath: string;
  duration: number;
  lipSyncOffsetMs?: number;
}

export interface ImageResult {
  localPath: string;
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
  content: ChatContent;
}

export type ChatContent = string | ChatContentPart[];

export type ChatContentPart =
  | {
      type: 'text';
      text: string;
    }
  | {
      type: 'image_url';
      image_url: { url: string };
      role?: string;
    }
  | {
      type: 'video_url';
      video_url: { url: string };
      role?: string;
    };

export interface ChatOptions {
  temperature?: number;
  jsonSchema?: object;
  reasoningEffort?: ReasoningEffort;
}

export type VisionOptions = ChatOptions;

export type ReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high';

export interface ModelClientFactory {
  create(): Promise<ModelClient>;
}

export type RuntimeCredentialsLoader = () => Promise<RuntimeCredentials>;
