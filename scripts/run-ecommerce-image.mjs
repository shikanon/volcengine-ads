import { mkdir, writeFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
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

async function pick(label, getter) {
  try {
    return await getter();
  } catch (error) {
    console.error(`[${label}] 加载失败：`, error instanceof Error ? error.message : error);
    throw error;
  }
}

async function main() {
  await ensureMainBuilt();

  const { SqliteTaskRepository } = await import(join(MAIN_DIST, 'db', 'index.js'));
  const { getPipeline } = await import(join(MAIN_DIST, 'pipelines', 'index.js'));
  const { runPipeline } = await import(join(MAIN_DIST, 'pipelines', 'runner.js'));
  const { LocalMockModelClient } = await import(
    join(MAIN_DIST, 'model-client', 'local-mock.js')
  );
  const { generatePlaceholderImage } = await import(join(MAIN_DIST, 'media', 'ffmpeg.js'));

  const runId = Date.now();
  const runDir = resolve(REPO_ROOT, 'runs', `ecommerce-image-${runId}`);
  const artifactDir = resolve(runDir, 'artifacts');
  const userDataPath = runDir;
  await mkdir(artifactDir, { recursive: true });

  const productImagePath = join(runDir, 'product.png');
  await pick('generateProductImage', () =>
    generatePlaceholderImage(productImagePath, {
      width: 1024,
      height: 1024,
      backgroundColor: '#f4ede2',
      foregroundColor: '#1c1917',
      accentColor: '#e0583a',
      mainText: '草本洗发露',
      subText: '温和配方 · 大容量',
      badgeText: 'DEMO 演示商品图',
    }),
  );
  console.log(`[run-ecommerce-image] 商品图已生成：${productImagePath}`);

  const request = {
    type: 'ecommerce_image',
    input: {
      productImagePath,
      variantCount: 2,
      scenePrompt: '真实家庭浴室场景 · 自然光生活氛围',
      style: 'lifestyle',
      fixedCopy: '限时 8 折 · 到手 79 元',
    },
  };

  const repository = new SqliteTaskRepository(join(userDataPath, 'ecommerce-image.sqlite'));
  const modelClient = new LocalMockModelClient({ variantLabel: 'demo', seed: runId });
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
    console.error('[run-ecommerce-image] pipeline 失败：', error instanceof Error ? error.message : error);
    throw error;
  }

  const finalTask = repository.getTask(task.id);
  await writeFile(join(runDir, 'task.json'), JSON.stringify(finalTask, null, 2));

  const files = await readdir(artifactDir, { withFileTypes: true });
  const fileList = await Promise.all(
    files
      .filter((entry) => entry.isFile())
      .map(async (entry) => {
        const absolute = join(artifactDir, entry.name);
        const fileStats = await stat(absolute);
        return {
          name: entry.name,
          path: absolute,
          sizeBytes: fileStats.size,
        };
      }),
  );
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
    console.log(`  - ${asset.kind} [${(asset.tags ?? []).join(' / ')}] ${asset.path} ${size !== null ? `(${size} KB)` : '(文件未找到)'} 打开：open "${asset.path}"`);
  }

  console.log('\n提示：');
  console.log('  - 直接运行： node scripts/run-ecommerce-image.mjs');
  console.log('  - 删除所有运行： rm -rf runs/');
  console.log('  - 在 macOS 上打开最终图： open "runs/ecommerce-image-<timestamp>/artifacts/final_1.png"');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
