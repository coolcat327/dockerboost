// Keep the resolved variant in task parameters; only a generic preference may match variants.
export function matchBatchPlatform(platforms, preferred) {
  if (platforms.includes(preferred)) return preferred;
  if (preferred?.split('/').length === 2) return platforms.find(platform => platform.startsWith(`${preferred}/`)) || '';
  return '';
}
