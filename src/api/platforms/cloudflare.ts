import { createApiApp } from '../app';
import type { Env } from '../common/types';

export interface CloudflareEnv extends Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
}

export default createApiApp((request, env) => (env as CloudflareEnv).ASSETS.fetch(request));
