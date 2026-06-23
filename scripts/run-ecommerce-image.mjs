import { mkdir, readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, '..');
const REPO_ROOT = resolve(__dirname, '..');
const MAIN_DIST = join(REPO_ROOT, 'dist', 'main');

async function ensureMainBuilt() {
  if (!existsSync(MAIN_DIST)) {
    throw new Error(
      `未找到主进程编译产物：${MAIN_DIST}\n请先在项目根目录执行：\n  npm run build:main`,
    );
  }
}

function setEnvIfMissing(name, value) {
  if (!process.env[name] && value) {
    process.env[name] = value;
  }
}

async function loadLocalEnvFile() {
  const envPath = process.env.ECOMMERCE_IMAGE_ENV_FILE || join(REPO_ROOT, '.env.local');
  if (!existsSync(envPath)) {
    return;
  }
  const content = await readFile(envPath, 'utf8');
  for (const rawLine of content.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const equalsIndex = line.indexOf('=');
    if (equalsIndex <= 0) {
      continue;
    }
    const name = line.slice(0, equalsIndex).trim();
    let value = line.slice(equalsIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    setEnvIfMissing(name, value);
  }
}

function optional(name, fallback) {
  return process.env[name]?.trim() || fallback;
}

function requiredOne(names, usage) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) {
      return value;
    }
  }
  throw new Error(
    `缺少${usage}环境变量：${names.join(' 或 ')}。请写入 .env.local 或当前 shell 环境。`,
  );
}

function resolveInputPath(value) {
  if (!value?.trim()) {
    return undefined;
  }
  const normalized = value.trim();
  return isAbsolute(normalized) ? normalized : resolve(REPO_ROOT, normalized);
}

function runtimeCredentialsFromEnv() {
  const arkApiKey = process.env.ARK_API_KEY?.trim();
  const imageApiKey = process.env.IMAGE_API_KEY?.trim() || arkApiKey;
  const llmApiKey = process.env.LLM_API_KEY?.trim() || arkApiKey;
  if (!imageApiKey) {
    requiredOne(['IMAGE_API_KEY', 'ARK_API_KEY'], '图片生成 ');
  }
  if (!llmApiKey) {
    requiredOne(['LLM_API_KEY', 'ARK_API_KEY'], '视觉/文案 ');
  }
  return {
    imageApiKey,
    llmApiKey,
    seedanceApiKey: process.env.SEEDANCE_API_KEY?.trim() || arkApiKey,
    provider: {
      seedanceBaseUrl: optional(
        'SEEDANCE_BASE_URL',
        optional('ARK_BASE_URL', 'https://ark.cn-beijing.volces.com/api/v3'),
      ),
      seedanceModel: optional('SEEDANCE_MODEL', 'doubao-seedance-2-0-260128'),
      imageBaseUrl: optional(
        'IMAGE_BASE_URL',
        optional('ARK_BASE_URL', 'https://ark.cn-beijing.volces.com/api/v3'),
      ),
      imageModel: optional('IMAGE_MODEL', 'doubao-seedream-5-0-260128'),
      llmBaseUrl: optional(
        'LLM_BASE_URL',
        optional('ARK_BASE_URL', 'https://ark.cn-beijing.volces.com/api/v3'),
      ),
      llmModel: optional('LLM_MODEL', optional('ARK_CHAT_MODEL', 'doubao-seed-2-0-pro-260215')),
      ttsBaseUrl: optional('TTS_BASE_URL', 'https://openspeech.bytedance.com'),
      ttsVoice: optional('TTS_VOICE', 'zh_female_vv_uranus_bigtts'),
      asrBaseUrl: optional('ASR_BASE_URL', 'https://openspeech.bytedance.com'),
      asrResourceId: optional('ASR_RESOURCE_ID', 'volc.seedasr.auc'),
      ossEndpoint: optional('OSS_ENDPOINT', ''),
      ossBucketName: optional('OSS_BUCKET_NAME', ''),
    },
  };
}

async function createModelClient(runId) {
  const mode = optional('ECOMMERCE_IMAGE_MODEL_CLIENT', 'real').toLowerCase();
  if (mode === 'mock') {
    const { LocalMockModelClient } = await import(join(MAIN_DIST, 'model-client', 'local-mock.js'));
    console.log(
      '[run-ecommerce-image] 模型模式：mock（显式由 ECOMMERCE_IMAGE_MODEL_CLIENT=mock 开启）',
    );
    return new LocalMockModelClient({ variantLabel: 'demo', seed: runId });
  }
  if (mode !== 'real') {
    throw new Error(`不支持的 ECOMMERCE_IMAGE_MODEL_CLIENT：${mode}，仅支持 real 或 mock`);
  }
  const { VolcengineModelClient } = await import(join(MAIN_DIST, 'model-client', 'volcengine.js'));
  const credentials = runtimeCredentialsFromEnv();
  console.log(
    `[run-ecommerce-image] 模型模式：real，imageModel=${credentials.provider.imageModel}，llmModel=${credentials.provider.llmModel}`,
  );
  return new VolcengineModelClient(credentials);
}

async function pick(label, getter) {
  try {
    return await getter();
  } catch (error) {
    console.error(`[${label}] 加载失败：`, error instanceof Error ? error.message : error);
    throw error;
  }
}

async function listFilesRecursively(rootDir) {
  const entries = await readdir(rootDir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursively(absolute)));
      continue;
    }
    if (entry.isFile()) {
      const fileStats = await stat(absolute);
      files.push({
        name: relative(rootDir, absolute),
        path: absolute,
        sizeBytes: fileStats.size,
      });
    }
  }
  return files;
}

async function main() {
  await loadLocalEnvFile();
  await ensureMainBuilt();

  const { SqliteTaskRepository } = await import(join(MAIN_DIST, 'db', 'index.js'));
  const { getPipeline } = await import(join(MAIN_DIST, 'pipelines', 'index.js'));
  const { runPipeline } = await import(join(MAIN_DIST, 'pipelines', 'runner.js'));
  const { generatePlaceholderImage } = await import(join(MAIN_DIST, 'media', 'ffmpeg.js'));

  const runId = Date.now();
  const runDir = resolve(REPO_ROOT, 'runs', `ecommerce-image-${runId}`);
  const artifactDir = resolve(runDir, 'artifacts');
  const userDataPath = runDir;
  await mkdir(artifactDir, { recursive: true });

  const suppliedProductImagePath = resolveInputPath(process.env.ECOMMERCE_PRODUCT_IMAGE_PATH);
  const productImagePath = suppliedProductImagePath ?? join(runDir, 'product.png');
  if (suppliedProductImagePath) {
    if (!existsSync(productImagePath)) {
      throw new Error(`商品参考图不存在：${productImagePath}`);
    }
    console.log(`[run-ecommerce-image] 使用外部商品参考图：${productImagePath}`);
  } else {
    await pick('generateProductImage', () =>
      generatePlaceholderImage(productImagePath, {
        width: 1024,
        height: 1024,
        backgroundColor: '#f4ede2',
        foregroundColor: '#1c1917',
        accentColor: '#e0583a',
        mainText: optional('ECOMMERCE_PRODUCT_NAME', '草本洗发露'),
        subText: optional('ECOMMERCE_PRODUCT_SUBTITLE', '温和配方 · 大容量'),
        badgeText: '真实模型参考图',
      }),
    );
    console.log(`[run-ecommerce-image] 本地商品参考图已生成：${productImagePath}`);
  }

  const request = {
    type: 'ecommerce_image',
    input: {
      productImagePath,
      variantCount: Number(optional('ECOMMERCE_VARIANT_COUNT', '2')),
      scenePrompt: optional('ECOMMERCE_SCENE_PROMPT', '真实家庭浴室场景 · 自然光生活氛围'),
      style: optional('ECOMMERCE_STYLE', 'lifestyle'),
      fixedCopy: optional('ECOMMERCE_FIXED_COPY', '限时 8 折 · 到手 79 元'),
    },
  };

  const repository = new SqliteTaskRepository(join(userDataPath, 'ecommerce-image.sqlite'));
  const modelClient = await createModelClient(runId);
  const pipeline = getPipeline(request.type);
  if (pipeline === undefined) {
    throw new Error(`未找到任务类型：${request.type}`);
  }

  const task = repository.createTask({
    request,
    stepNames: pipeline.steps.map((step) => step.name),
  });
  console.log(`[run-ecommerce-image] 任务已创建：task=${task.id} steps=${task.steps.length}`);

  const emitProgress = (event) => {
    const safeEvent = typeof event === 'object' && event !== null ? event : {};
    console.log(
      `[task-progress] step=${safeEvent.step ?? ''} status=${safeEvent.status ?? ''} progress=${safeEvent.progress ?? 0}`,
    );
  };

  await writeFile(join(runDir, 'input.json'), JSON.stringify(request, null, 2));

  try {
    await runPipeline({
      task,
      pipeline,
      repository,
      modelClient,
      workflowPrompts: {},
      userDataPath,
      emitProgress,
    });
    console.log('[run-ecommerce-image] pipeline 完成 ✓');
  } catch (error) {
    console.error(
      '[run-ecommerce-image] pipeline 失败：',
      error instanceof Error ? error.message : error,
    );
    throw error;
  }

  const finalTask = repository.getTask(task.id);
  await writeFile(join(runDir, 'task.json'), JSON.stringify(finalTask, null, 2));

  const fileList = await listFilesRecursively(artifactDir);
  fileList.sort((a, b) => a.name.localeCompare(b.name));

  const assets = repository.listAssets(task.id);
  const assetDetails = [];
  for (const asset of assets) {
    const hasFile = existsSync(asset.path);
    const size = hasFile ? (await stat(asset.path)).size : undefined;
    assetDetails.push({
      id: asset.id,
      kind: asset.kind,
      path: asset.path,
      tags: asset.tags,
      sizeBytes: size,
    });
  }
  await writeFile(join(runDir, 'assets.json'), JSON.stringify(assetDetails, null, 2));

  console.log('\n========== 运行结果 ==========');
  console.log(`运行目录：${runDir}`);
  console.log(`产物目录：${artifactDir}`);
  console.log(`任务 ID ：${task.id}`);
  console.log(`任务状态：${finalTask?.status ?? 'unknown'}`);
  console.log(`任务进度：${finalTask?.progress ?? 0}%`);
  if (finalTask?.error !== undefined && finalTask.error !== null && finalTask.error !== '') {
    console.log(`任务错误：${finalTask.error}`);
  }
  console.log('\nPipeline 产物文件：');
  for (const file of fileList) {
    console.log(`  - ${file.name} (${Math.round(file.sizeBytes / 1024)} KB)`);
  }

  console.log('\n素材库登记：');
  for (const asset of assets) {
    const hasFile = existsSync(asset.path);
    const size = hasFile ? Math.round((await stat(asset.path)).size / 1024) : null;
    console.log(
      `  - ${asset.kind} [${(asset.tags ?? []).join(' / ')}] ${asset.path} ${size !== null ? `(${size} KB)` : '(文件未找到)'} 打开：open "${asset.path}"`,
    );
  }

  console.log('\n提示：');
  console.log('  - 真实模型运行： node scripts/run-ecommerce-image.mjs');
  console.log(
    '  - 必要配置：IMAGE_API_KEY/ARK_API_KEY + LLM_API_KEY/ARK_API_KEY，可放在 .env.local',
  );
  console.log(
    '  - 使用外部商品图： ECOMMERCE_PRODUCT_IMAGE_PATH=/absolute/path/product.png node scripts/run-ecommerce-image.mjs',
  );
  console.log(
    '  - 离线 mock 回归： ECOMMERCE_IMAGE_MODEL_CLIENT=mock node scripts/run-ecommerce-image.mjs',
  );
  console.log('  - 删除所有运行： rm -rf runs/');
  console.log('  - 在 macOS 上打开最终图：复制上方 final_1.png 对应的 open 命令');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
