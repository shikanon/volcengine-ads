const { chmod, mkdir, readdir, rm, writeFile } = require('node:fs/promises');
const { join } = require('node:path');

const YT_DLP_RELEASE_BASE_URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download';
const DOWNLOAD_TIMEOUT_MS = 30_000;
const MAX_DOWNLOAD_RETRIES = 3;
const RETRY_DELAY_MS = 1_500;

function sleep(ms) {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}

function normalizeArch(arch) {
  if (typeof arch === 'string') {
    return arch;
  }

  switch (arch) {
    case 0:
      return 'ia32';
    case 1:
      return 'x64';
    case 2:
      return 'armv7l';
    case 3:
      return 'arm64';
    case 4:
      return 'universal';
    default:
      return String(arch);
  }
}

function runtimeBinaryName(platform) {
  return platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
}

function releaseAssetName(platform, arch) {
  if (platform === 'darwin') {
    return 'yt-dlp_macos';
  }

  if (platform === 'win32') {
    if (arch === 'arm64') {
      return 'yt-dlp_arm64.exe';
    }
    if (arch === 'ia32') {
      return 'yt-dlp_x86.exe';
    }
    return 'yt-dlp.exe';
  }

  if (platform === 'linux') {
    if (arch === 'arm64') {
      return 'yt-dlp_linux_aarch64';
    }
    return 'yt-dlp_linux';
  }

  return undefined;
}

async function emptyDirectory(dirPath) {
  await mkdir(dirPath, { recursive: true });
  const entries = await readdir(dirPath, { withFileTypes: true });
  await Promise.all(
    entries.map((entry) => rm(join(dirPath, entry.name), { recursive: true, force: true })),
  );
}

async function downloadBinary(url) {
  let lastError;

  for (let attempt = 1; attempt <= MAX_DOWNLOAD_RETRIES; attempt += 1) {
    try {
      const response = await globalThis.fetch(url, {
        signal: globalThis.AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
      });
      if (!response.ok) {
        throw new Error(
          `Failed to download yt-dlp from ${url}: ${response.status} ${response.statusText}`,
        );
      }
      return globalThis.Buffer.from(await response.arrayBuffer());
    } catch (error) {
      lastError = error;
      if (attempt < MAX_DOWNLOAD_RETRIES) {
        globalThis.console.warn(
          `[prepare-yt-dlp] Download attempt ${attempt} failed, retrying: ${error instanceof Error ? error.message : String(error)}`,
        );
        await sleep(RETRY_DELAY_MS * attempt);
        continue;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

module.exports = async (context) => {
  const platform = context.electronPlatformName;
  const arch = normalizeArch(context.arch);
  const assetName = releaseAssetName(platform, arch);
  const projectDir = context.packager?.projectDir ?? globalThis.process.cwd();

  if (assetName === undefined) {
    throw new Error(`Unsupported yt-dlp target: platform=${platform} arch=${arch}`);
  }

  const binDir = join(projectDir, 'resources', 'bin');
  const targetPath = join(binDir, runtimeBinaryName(platform));
  const url = `${YT_DLP_RELEASE_BASE_URL}/${assetName}`;

  await emptyDirectory(binDir);

  const body = await downloadBinary(url);
  await writeFile(targetPath, body);
  if (platform !== 'win32') {
    await chmod(targetPath, 0o755);
  }

  globalThis.console.log(
    `[prepare-yt-dlp] Prepared ${assetName} for ${platform}/${arch} -> ${targetPath}`,
  );
};
