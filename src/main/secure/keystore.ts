import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

import { AppError } from '../errors.js';
import type { TaskRepository } from '../db/index.js';
import type { ProviderPublicSettings, SettingsState, SettingsUpdate } from '../../shared/types.js';
import { normalizeWorkflowPrompts } from '../../shared/workflows.js';
import type { WorkflowPromptOverrides } from '../../shared/workflows.js';

const SERVICE_NAME = 'volcengine-ads';
const ACCOUNT_NAME = 'local-master-key';
const ENCRYPTED_KEYS = new Set([
  'seedanceApiKey',
  'imageApiKey',
  'llmApiKey',
  'ttsAppId',
  'ttsToken',
  'asrApiKey',
  'asrAppId',
  'asrToken',
  'ossAccessKeyId',
  'ossAccessKeySecret',
]);

const DEFAULT_PROVIDER: ProviderPublicSettings = {
  seedanceBaseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
  seedanceModel: 'doubao-seedance-2-0-260128',
  imageBaseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
  imageModel: 'doubao-seedream-5-0-260128',
  llmBaseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
  llmModel: 'doubao-seed-2-0-pro-260215',
  ttsBaseUrl: 'https://openspeech.bytedance.com',
  ttsVoice: 'zh_female_vv_uranus_bigtts',
  asrBaseUrl: 'https://openspeech.bytedance.com',
  asrResourceId: 'volc.seedasr.auc',
  ossEndpoint: '',
  ossBucketName: '',
};

function normalizeProviderSettings(
  provider: Partial<ProviderPublicSettings>,
): ProviderPublicSettings {
  return {
    seedanceBaseUrl: provider.seedanceBaseUrl ?? DEFAULT_PROVIDER.seedanceBaseUrl,
    seedanceModel:
      provider.seedanceModel === undefined ||
      provider.seedanceModel === 'seedance-2-0' ||
      provider.seedanceModel === 'doubao-seedance-2-0'
        ? DEFAULT_PROVIDER.seedanceModel
        : provider.seedanceModel,
    imageBaseUrl: provider.imageBaseUrl ?? DEFAULT_PROVIDER.imageBaseUrl,
    imageModel: provider.imageModel ?? DEFAULT_PROVIDER.imageModel,
    llmBaseUrl: provider.llmBaseUrl ?? DEFAULT_PROVIDER.llmBaseUrl,
    llmModel:
      provider.llmModel === undefined || provider.llmModel === 'doubao-seed-1-6'
        ? DEFAULT_PROVIDER.llmModel
        : provider.llmModel,
    ttsBaseUrl: provider.ttsBaseUrl ?? DEFAULT_PROVIDER.ttsBaseUrl,
    ttsVoice:
      provider.ttsVoice === undefined || provider.ttsVoice === 'volcano_tts'
        ? DEFAULT_PROVIDER.ttsVoice
        : provider.ttsVoice,
    asrBaseUrl: provider.asrBaseUrl ?? DEFAULT_PROVIDER.asrBaseUrl,
    asrResourceId: provider.asrResourceId ?? DEFAULT_PROVIDER.asrResourceId,
    ossEndpoint: provider.ossEndpoint ?? DEFAULT_PROVIDER.ossEndpoint,
    ossBucketName: provider.ossBucketName ?? DEFAULT_PROVIDER.ossBucketName,
  };
}

function logError(message: string, error: unknown): void {
  console.error(message, error);
}

export interface RuntimeCredentials {
  seedanceApiKey?: string;
  imageApiKey?: string;
  llmApiKey?: string;
  ttsAppId?: string;
  ttsToken?: string;
  asrApiKey?: string;
  asrAppId?: string;
  asrToken?: string;
  ossAccessKeyId?: string;
  ossAccessKeySecret?: string;
  provider: ProviderPublicSettings;
}

export interface SecretProvider {
  getOrCreateSecret(): Promise<string>;
}

export class KeytarSecretProvider implements SecretProvider {
  async getOrCreateSecret(): Promise<string> {
    try {
      const keytarModule = await import('keytar');
      const keytar = { ...keytarModule.default, ...keytarModule };
      const existing = await keytar.getPassword(SERVICE_NAME, ACCOUNT_NAME);
      if (existing) {
        return existing;
      }
      const secret = randomBytes(32).toString('base64url');
      await keytar.setPassword(SERVICE_NAME, ACCOUNT_NAME, secret);
      return secret;
    } catch (error) {
      logError('Keychain access failed', error);
      throw new AppError('E_KEYSTORE_FAILED', '无法访问系统钥匙串', { cause: error });
    }
  }
}

export class StaticSecretProvider implements SecretProvider {
  constructor(private readonly secret: string) {}

  async getOrCreateSecret(): Promise<string> {
    return this.secret;
  }
}

function keyFromSecret(secret: string): Buffer {
  return createHash('sha256').update(secret).digest();
}

function encrypt(plainText: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFromSecret(secret), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    v: 1,
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: encrypted.toString('base64'),
  });
}

function decrypt(payload: string, secret: string): string {
  const parsed = JSON.parse(payload) as { iv: string; tag: string; data: string };
  const decipher = createDecipheriv(
    'aes-256-gcm',
    keyFromSecret(secret),
    Buffer.from(parsed.iv, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(parsed.tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(parsed.data, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

function getJson<T>(repository: TaskRepository, key: string, fallback: T): T {
  const value = repository.getSetting(key);
  if (!value) {
    return fallback;
  }
  return JSON.parse(value) as T;
}

export class SettingsService {
  constructor(
    private readonly repository: TaskRepository,
    private readonly secretProvider: SecretProvider = new KeytarSecretProvider(),
  ) {}

  async getPublicSettings(): Promise<SettingsState> {
    const provider = normalizeProviderSettings(
      getJson<Partial<ProviderPublicSettings>>(this.repository, 'provider', DEFAULT_PROVIDER),
    );
    const seedanceApiKey = await this.readEncrypted('seedanceApiKey');
    const imageApiKey = await this.readEncrypted('imageApiKey');
    const llmApiKey = await this.readEncrypted('llmApiKey');
    const ttsAppId = await this.readEncrypted('ttsAppId');
    const ttsToken = await this.readEncrypted('ttsToken');
    const asrApiKey = await this.readEncrypted('asrApiKey');
    const asrAppId = await this.readEncrypted('asrAppId');
    const asrToken = await this.readEncrypted('asrToken');
    const ossAccessKeyId = await this.readEncrypted('ossAccessKeyId');
    const ossAccessKeySecret = await this.readEncrypted('ossAccessKeySecret');
    const settings: SettingsState = {
      seedanceConfigured: Boolean(seedanceApiKey),
      imageConfigured: Boolean(imageApiKey),
      llmConfigured: Boolean(llmApiKey),
      ttsConfigured: Boolean(ttsAppId && ttsToken),
      asrConfigured: Boolean(asrApiKey || (asrAppId && asrToken)),
      concurrency: getJson<number>(this.repository, 'concurrency', 1),
      defaultPretrailerStyle: getJson(this.repository, 'defaultPretrailerStyle', 'auto'),
      complianceAccepted: getJson(this.repository, 'complianceAccepted', false),
      provider,
      workflowPrompts: normalizeWorkflowPrompts(
        getJson<WorkflowPromptOverrides>(this.repository, 'workflowPrompts', {}),
      ),
    };
    if (seedanceApiKey) settings.seedanceApiKey = seedanceApiKey;
    if (imageApiKey) settings.imageApiKey = imageApiKey;
    if (llmApiKey) settings.llmApiKey = llmApiKey;
    if (ttsAppId) settings.ttsAppId = ttsAppId;
    if (ttsToken) settings.ttsToken = ttsToken;
    if (asrApiKey) settings.asrApiKey = asrApiKey;
    if (asrAppId) settings.asrAppId = asrAppId;
    if (asrToken) settings.asrToken = asrToken;
    if (ossAccessKeyId) settings.ossAccessKeyId = ossAccessKeyId;
    if (ossAccessKeySecret) settings.ossAccessKeySecret = ossAccessKeySecret;
    return settings;
  }

  async updateSettings(update: SettingsUpdate): Promise<SettingsState> {
    for (const [key, value] of Object.entries(update)) {
      if (value === undefined || key === 'provider' || key === 'workflowPrompts') {
        continue;
      }
      if (ENCRYPTED_KEYS.has(key)) {
        await this.writeEncrypted(key, String(value));
      } else {
        this.repository.setSetting(key, JSON.stringify(value));
      }
    }
    if (update.provider) {
      const existing = normalizeProviderSettings(
        getJson<Partial<ProviderPublicSettings>>(this.repository, 'provider', DEFAULT_PROVIDER),
      );
      this.repository.setSetting(
        'provider',
        JSON.stringify(normalizeProviderSettings({ ...existing, ...update.provider })),
      );
    }
    if (update.workflowPrompts) {
      this.repository.setSetting(
        'workflowPrompts',
        JSON.stringify(normalizeWorkflowPrompts(update.workflowPrompts)),
      );
    }
    return this.getPublicSettings();
  }

  getWorkflowPrompts(): WorkflowPromptOverrides {
    return normalizeWorkflowPrompts(
      getJson<WorkflowPromptOverrides>(this.repository, 'workflowPrompts', {}),
    );
  }

  async getRuntimeCredentials(): Promise<RuntimeCredentials> {
    const provider = normalizeProviderSettings(
      getJson<Partial<ProviderPublicSettings>>(this.repository, 'provider', DEFAULT_PROVIDER),
    );
    const credentials: RuntimeCredentials = { provider };
    const seedanceApiKey = await this.readEncrypted('seedanceApiKey');
    const imageApiKey = await this.readEncrypted('imageApiKey');
    const llmApiKey = await this.readEncrypted('llmApiKey');
    const ttsAppId = await this.readEncrypted('ttsAppId');
    const ttsToken = await this.readEncrypted('ttsToken');
    const asrApiKey = await this.readEncrypted('asrApiKey');
    const asrAppId = await this.readEncrypted('asrAppId');
    const asrToken = await this.readEncrypted('asrToken');
    const ossAccessKeyId = await this.readEncrypted('ossAccessKeyId');
    const ossAccessKeySecret = await this.readEncrypted('ossAccessKeySecret');
    if (seedanceApiKey) credentials.seedanceApiKey = seedanceApiKey;
    if (imageApiKey) credentials.imageApiKey = imageApiKey;
    if (llmApiKey) credentials.llmApiKey = llmApiKey;
    if (ttsAppId) credentials.ttsAppId = ttsAppId;
    if (ttsToken) credentials.ttsToken = ttsToken;
    if (asrApiKey) credentials.asrApiKey = asrApiKey;
    if (asrAppId) credentials.asrAppId = asrAppId;
    if (asrToken) credentials.asrToken = asrToken;
    if (ossAccessKeyId) credentials.ossAccessKeyId = ossAccessKeyId;
    if (ossAccessKeySecret) credentials.ossAccessKeySecret = ossAccessKeySecret;
    return credentials;
  }

  private async writeEncrypted(key: string, value: string): Promise<void> {
    const secret = await this.secretProvider.getOrCreateSecret();
    this.repository.setSetting(key, encrypt(value, secret));
  }

  private async readEncrypted(key: string): Promise<string | undefined> {
    const payload = this.repository.getSetting(key);
    if (!payload) {
      return undefined;
    }
    if (!payload.trim().startsWith('{')) {
      return payload;
    }
    const secret = await this.secretProvider.getOrCreateSecret();
    return decrypt(payload, secret);
  }
}
