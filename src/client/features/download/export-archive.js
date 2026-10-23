import { buildVersion } from '../../common/download-cache-policy.js';
import { createDownloadTask } from '../../common/browser-download-task.js';
import { resolveImageExportWorker, runExport } from './image-export-client.js';
import { archiveFilename } from '../../common/image-reference.js';

export async function exportArchive({ image, platform, source, signal, onProgress }) {
  let task, worker;
  try {
    signal.throwIfAborted();
    task = await createDownloadTask('image');
    const workerUrl = await resolveImageExportWorker(document.querySelector('meta[name="image-export-worker"]')?.content || '/image-export-worker.js', { signal });
    signal.throwIfAborted();
    worker = new Worker(workerUrl);
    const result = await runExport(worker, { repository: image.repository, reference: image.reference, repoTag: image.original, source, platform, filename: archiveFilename(image.original, platform), version: buildVersion, sessionId: task.id }, onProgress, { signal });
    signal.throwIfAborted();
    task.save(result.archive, result.filename);
    return result;
  } finally {
    worker?.terminate();
    await task?.finish().catch(() => {});
  }
}
