import { createHmac, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';

import { fetch } from 'undici';

import { AppError } from '../errors.js';
import type { RuntimeCredentials } from '../secure/keystore.js';

export interface OssUploadResult {
  objectKey: string;
  signedUrl: string;
}

function contentTypeFor(path: string): string {
  const ext = extname(path).toLowerCase();
  if (ext === '.wav') return 'audio/wav';
  if (ext === '.mp3') return 'audio/mpeg';
  if (ext === '.ogg') return 'audio/ogg';
  if (ext === '.m4a') return 'audio/mp4';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.png') return 'image/png';
  return 'application/octet-stream';
}

function encodeObjectKey(objectKey: string): string {
  return objectKey.split('/').map(encodeURIComponent).join('/');
}

function endpointHost(endpoint: string): string {
  const withProtocol = endpoint.startsWith('http') ? endpoint : `https://${endpoint}`;
  return new URL(withProtocol).host;
}

function hmacSha1Base64(secret: string, value: string): string {
  return createHmac('sha1', secret).update(value).digest('base64');
}

function ensureOssCredentials(credentials: RuntimeCredentials): {
  accessKeyId: string;
  accessKeySecret: string;
  bucketName: string;
  endpoint: string;
} {
  const accessKeyId = credentials.ossAccessKeyId;
  const accessKeySecret = credentials.ossAccessKeySecret;
  const bucketName = credentials.provider.ossBucketName;
  const endpoint = credentials.provider.ossEndpoint;
  if (!accessKeyId || !accessKeySecret || !bucketName || !endpoint) {
    throw new AppError('E_MODEL_API_FAILED', 'OSS 凭据未配置，无法上传本地音频供 ASR 访问');
  }
  return { accessKeyId, accessKeySecret, bucketName, endpoint };
}

export async function uploadLocalFileForAsr(
  credentials: RuntimeCredentials,
  localPath: string,
  expiresInSec = 1800,
): Promise<OssUploadResult> {
  const { accessKeyId, accessKeySecret, bucketName, endpoint } = ensureOssCredentials(credentials);
  const host = endpointHost(endpoint);
  const objectKey = `volcengine-ads/asr/${Date.now()}-${randomUUID()}-${basename(localPath)}`;
  const encodedKey = encodeObjectKey(objectKey);
  const url = `https://${bucketName}.${host}/${encodedKey}`;
  const contentType = contentTypeFor(localPath);
  const date = new Date().toUTCString();
  const body = await readFile(localPath);
  const canonicalResource = `/${bucketName}/${objectKey}`;
  const stringToSign = `PUT\n\n${contentType}\n${date}\n${canonicalResource}`;
  const signature = hmacSha1Base64(accessKeySecret, stringToSign);

  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `OSS ${accessKeyId}:${signature}`,
      Date: date,
      'Content-Type': contentType,
    },
    body,
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new AppError('E_MODEL_API_FAILED', `OSS 上传失败：HTTP ${response.status} ${detail.slice(0, 200)}`);
  }

  const expires = Math.floor(Date.now() / 1000) + expiresInSec;
  const signedParams = `OSSAccessKeyId=${encodeURIComponent(accessKeyId)}&Expires=${expires}`;
  const getStringToSign = `GET\n\n\n${expires}\n${canonicalResource}`;
  const getSignature = encodeURIComponent(hmacSha1Base64(accessKeySecret, getStringToSign));
  return {
    objectKey,
    signedUrl: `${url}?${signedParams}&Signature=${getSignature}`,
  };
}
