import { jsonResponse } from '../../common/http';
import type { Env } from '../../common/types';
import { registrySources } from '../../common/sources';

export function healthResponse(env: Env) {
  const sources = registrySources(env);
  return jsonResponse({ ok: true, registry: new URL(sources[0].url).hostname, sources: sources.map(({ id, label }) => ({ id, label })) });
}

export function sourcesResponse(env: Env) {
  return jsonResponse(
    { sources: registrySources(env).map(({ id, label, url, naming, requiresNamespace, example }) => ({ id, label, host: new URL(url).hostname, naming, requiresNamespace, example })) },
    { headers: { 'cache-control': 'public, max-age=300, s-maxage=3600' } }
  );
}
