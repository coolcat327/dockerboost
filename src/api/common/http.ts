import type { Handler, Hono } from 'hono';
import type { ApiEnv } from './types';

const methodNotAllowed = () => new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET' } });

// Hono dispatches HEAD through GET. Check the original method before any work.
export function getRoute(router: Hono<ApiEnv>, path: string, handler: Handler<ApiEnv>) {
  router.get(path, (context, next) => context.req.raw.method === 'GET' ? next() : methodNotAllowed(), handler);
  router.all(path, methodNotAllowed);
}
