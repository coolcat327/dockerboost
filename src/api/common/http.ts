import type { Handler, Hono } from 'hono';
import type { ApiEnv } from './types';

const methodNotAllowed = () => new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET' } });

// Hono dispatches HEAD through GET. Check the original method before any work.
export function getRoute(router: Hono<ApiEnv>, path: string, handler: Handler<ApiEnv>) {
  router.get(path, (context, next) => context.req.raw.method === 'GET' ? next() : methodNotAllowed(), handler);
  router.all(path, methodNotAllowed);
}

// EdgeOne's Response constructor does not implement the static json() method.
export function jsonResponse(value: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers ?? {});
  if (!headers.has('content-type')) headers.set('content-type', 'application/json');
  return new Response(JSON.stringify(value), { ...init, headers });
}
