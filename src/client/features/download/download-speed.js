export function formatTransferSpeed(bytesPerSecond) {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return '';
  if (bytesPerSecond < 1024 * 1024) return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
  return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`;
}

export function formatImageSize(bytes) {
  if (!Number.isSafeInteger(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function formatImageMetadata(details, layerUnit, separator = ' · ') {
  const size = formatImageSize(details?.sizeBytes);
  const layers = Number.isSafeInteger(details?.layers) && details.layers >= 0
    ? `${details.layers} ${layerUnit}` : '';
  return [layers, size].filter(Boolean).join(separator);
}

export function formatDuration(milliseconds) {
  const tenths = Math.max(0, Math.round(milliseconds / 100));
  if (tenths < 600) return `${(tenths / 10).toFixed(1)}秒`;
  return `${Math.floor(tenths / 600)}分${((tenths % 600) / 10).toFixed(1)}秒`;
}

export function createTransferRate(clock = () => performance.now()) {
  let previousBytes = 0;
  let previousTime;

  return (completed) => {
    const now = clock();
    if (previousTime === undefined || completed < previousBytes) {
      previousBytes = completed;
      previousTime = now;
      return '';
    }
    const elapsed = now - previousTime;
    if (elapsed < 1000) return '';
    const transferred = completed - previousBytes;
    previousBytes = completed;
    previousTime = now;
    return elapsed > 0 && transferred > 0 ? formatTransferSpeed(transferred * 1000 / elapsed) : '';
  };
}
