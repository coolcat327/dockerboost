// Build-time identity includes API code, so installer/template updates invalidate downloads too.
export const buildVersion = typeof __DOCKERBOOST_VERSION__ === 'undefined' ? 'development' : __DOCKERBOOST_VERSION__;

export function downloadRequestUrl(path, version = buildVersion) {
  const url = new URL(path, 'https://dockerboost.invalid');
  url.searchParams.set('version', version);
  return `${url.pathname}${url.search}${url.hash}`;
}

export function staticAssetUrl(path, version = buildVersion) {
  return `/assets/${version}/${path.replace(/^\/+/, '')}`;
}
