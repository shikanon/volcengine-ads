import { join } from 'node:path';

import { AppError } from '../../errors.js';
import { downloadLarkVideos } from '../../services/lark-download.js';
import { parseLarkDocumentUrl } from '../../services/lark-download-helpers.js';
import type { LarkDownloadInput } from '../../../shared/types.js';
import type { PipelineDefinition, StepContext } from '../types.js';

async function runDownload(ctx: StepContext<LarkDownloadInput>) {
  const parsed = parseLarkDocumentUrl(ctx.input.url);
  const predictedSummaryPath = join(
    ctx.input.outputDir ?? join(ctx.artifactDir, 'downloads'),
    parsed.token,
    'download-summary.json',
  );
  const { summary, summaryPath } = await downloadLarkVideos({
    input: ctx.input,
    artifactDir: ctx.artifactDir,
    onProgress: (message, completed, total) => {
      const progress =
        total > 0 ? Math.min(99, Math.max(0, Math.floor((completed / total) * 100))) : ctx.task.progress;
      ctx.emitProgress({
        taskId: ctx.task.id,
        status: 'running',
        progress,
        step: 'download',
        message,
        artifactPath: predictedSummaryPath,
      });
    },
  });

  ctx.repository.createAsset({
    taskId: ctx.task.id,
    kind: 'report',
    path: summaryPath,
    tags: ['lark_download', summary.sourceType],
  });

  if (summary.successCount === 0) {
    throw new AppError(
      'E_DOWNLOAD_FAILED',
      summary.loginHint ?? summary.failures[0]?.reason ?? '未下载到任何飞书视频',
    );
  }

  return {
    artifactPath: summaryPath,
    logs: `发现 ${summary.discovered} 个视频块，成功 ${summary.successCount} 个，失败 ${summary.failureCount} 个。`,
  };
}

export const larkDownloadPipeline: PipelineDefinition<LarkDownloadInput> = {
  type: 'lark_download',
  steps: [{ name: 'download', runStep: runDownload }],
};
