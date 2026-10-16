import { Hono } from 'hono';
import type { ApiEnv } from '../../common/types';
import { registryProxyResponse } from './proxy';

export const registryRoutes = new Hono<ApiEnv>();
registryRoutes.all('/v2', c => registryProxyResponse(c.req.raw, c.env));
registryRoutes.all('/v2/*', c => registryProxyResponse(c.req.raw, c.env));
