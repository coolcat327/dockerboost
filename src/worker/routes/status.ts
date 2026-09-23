import type { Env } from '../types';
import { registrySources } from '../sources';

export function healthResponse(env: Env) {
  const sources = registrySources(env);
  return Response.json({ ok: true, registry: new URL(sources[0].url).hostname, sources: sources.map(({ id, label }) => ({ id, label })) });
}

export function sourcesResponse(env: Env) {
  return Response.json(
    { sources: registrySources(env).map(({ id, label, url, naming, requiresNamespace, example }) => ({ id, label, host: new URL(url).hostname, naming, requiresNamespace, example })) },
    { headers: { 'cache-control': 'public, max-age=300, s-maxage=3600' } }
  );
}
