import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

import { AppError } from '../errors.js';
import type { TaskRepository } from '../db/index.js';
import type { ProviderPublicSettings, SettingsState, SettingsUpdate } from '../../shared/types.js';

const SERVICE_NAME = 'volcengine-ads';
const ACCOUNT_NAME = 'local-master-key';
const ENCRYPTED_KEYS = new Set([
  'seedanceApiKey',
  'llmApiKey',
  'ttsAppId',
  'ttsToken',
  'asrApiKey',
]);

const DEFAULT_PROVIDER: ProviderPublicSettings = {
  seedanceBaseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
  seedanceModel: 'seedance-2-0',
  llmBaseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
  llmModel: 'doubao-seed-1-6',
  ttsBaseUrl: 'https://openspeech.bytedance.com',
  ttsVoice: 'zh_female_vv_uranus_bigtts',
  asrBaseUrl: 'https://openspeech.bytedance.com',
};

function logError(message: string, error: unknown): void {
  console.error(message, error);
}

export interface RuntimeCredentials {
  seedanceApiKey?: string;
  llmApiKey?: string;
  ttsAppId?: string;
  ttsToken?: string;
  asrApiKey?: string;
  provider: ProviderPublicSettings;
}

export interface SecretProvider {
  getOrCreateSecret(): Promise<string>;
}

export class KeytarSecretProvider implements SecretProvider {
  async getOrCreateSecret(): Promise<string> {
    try {
      const keytar = await import('keytar');
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
    const provider = getJson<ProviderPublicSettings>(this.repository, 'provider', DEFAULT_PROVIDER);
    return {
      seedanceConfigured: Boolean(await this.readEncrypted('seedanceApiKey')),
      llmConfigured: Boolean(await this.readEncrypted('llmApiKey')),
      ttsConfigured: Boolean(
        (await this.readEncrypted('ttsAppId')) && (await this.readEncrypted('ttsToken')),
      ),
      asrConfigured: Boolean(await this.readEncrypted('asrApiKey')),
      concurrency: getJson<number>(this.repository, 'concurrency', 1),
      defaultPretrailerStyle: getJson(this.repository, 'defaultPretrailerStyle', 'auto'),
      complianceAccepted: getJson(this.repository, 'complianceAccepted', false),
      provider,
    };
  }

  async updateSettings(update: SettingsUpdate): Promise<SettingsState> {
    for (const [key, value] of Object.entries(update)) {
      if (value === undefined || key === 'provider') {
        continue;
      }
      if (ENCRYPTED_KEYS.has(key)) {
        await this.writeEncrypted(key, String(value));
      } else {
        this.repository.setSetting(key, JSON.stringify(value));
      }
    }
    if (update.provider) {
      const existing = getJson<ProviderPublicSettings>(this.repository, 'provider', DEFAULT_PROVIDER);
      this.repository.setSetting('provider', JSON.stringify({ ...existing, ...update.provider }));
    }
    return this.getPublicSettings();
  }

  async getRuntimeCredentials(): Promise<RuntimeCredentials> {
    const provider = getJson<ProviderPublicSettings>(this.repository, 'provider', DEFAULT_PROVIDER);
    const credentials: RuntimeCredentials = { provider };
    const seedanceApiKey = await this.readEncrypted('seedanceApiKey');
    const llmApiKey = await this.readEncrypted('llmApiKey');
    const ttsAppId = await this.readEncrypted('ttsAppId');
    const ttsToken = await this.readEncrypted('ttsToken');
    const asrApiKey = await this.readEncrypted('asrApiKey');
    if (seedanceApiKey) credentials.seedanceApiKey = seedanceApiKey;
    if (llmApiKey) credentials.llmApiKey = llmApiKey;
    if (ttsAppId) credentials.ttsAppId = ttsAppId;
    if (ttsToken) credentials.ttsToken = ttsToken;
    if (asrApiKey) credentials.asrApiKey = asrApiKey;
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
    const secret = await this.secretProvider.getOrCreateSecret();
    return decrypt(payload, secret);
  }
}
