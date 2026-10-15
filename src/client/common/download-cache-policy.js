// Build-time identity includes API code, so installer/template updates invalidate downloads too.
export const buildVersion = typeof __DOCKERBOOST_VERSION__ === 'undefined' ? 'development' : __DOCKERBOOST_VERSION__;

export function downloadRequestUrl(path, version = buildVersion) {
  const url = new URL(path, 'https://dockerboost.invalid');
  url.searchParams.set('version', version);
  return `${url.pathname}${url.search}${url.hash}`;
}

// Read the live deployment before each task; even an already-open page uses its new cache key.
export async function currentDownloadVersion({ signal } = {}) {
  const response = await fetch('/version.json', { cache: 'no-store', signal });
  if (!response.ok) throw new Error('无法读取下载版本，请刷新页面后重试。');
  const { version } = await response.json();
  if (typeof version !== 'string' || !/^[A-Za-z0-9_-]{8}$/.test(version)) {
    throw new Error('下载版本信息无效，请刷新页面后重试。');
  }
  return version;
}
