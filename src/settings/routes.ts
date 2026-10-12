import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { randomUUID } from 'node:crypto';
import { connectionInputSchema, removalSchema } from '../core/connection-model.js';
import type { Runtime } from '../runtime.js';
import { probeConnections, type Probe } from './probe.js';

export function settingsRoutes(runtime: Runtime, probe: Probe = probeConnections) {
  const routes = new Hono(), csrf = randomUUID();
  routes.use('*', bodyLimit({ maxSize: 64 * 1024, onError: (c) => c.json({ error: 'SETTINGS_BODY_TOO_LARGE' }, 413) }));
  routes.use('*', async (c, next) => {
    if (c.req.method !== 'GET' && c.req.header('X-Release-Settings') !== csrf) return c.json({ error: 'SETTINGS_TOKEN_REQUIRED' }, 403);
    await next();
  });
  const view = async () => ({ ...await runtime.connections.view(), csrf });
  routes.get('/', async (c) => c.json(await view()));
  routes.post('/check', async (c) => c.json(await runtime.connections.check(connectionInputSchema.parse(await c.req.json()), probe)));
  routes.post('/save', async (c) => {
    await runtime.connections.save(connectionInputSchema.parse(await c.req.json()));
    return c.json(await view());
  });
  routes.post('/remove', async (c) => {
    const input = removalSchema.parse(await c.req.json());
    await runtime.connections.remove(input.id, input.revision); return c.json(await view());
  });
  return routes;
}
