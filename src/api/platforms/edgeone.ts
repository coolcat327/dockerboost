import { createApiApp } from '../app';
import type { Env } from '../common/types';

const app = createApiApp();

export function onRequest(context: { request: Request; env: Env }) {
  return app.fetch(context.request, context.env);
}

export default onRequest;
