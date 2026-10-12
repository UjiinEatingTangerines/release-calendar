import { Hono } from 'hono';
import { compress } from 'hono/compress';
import { serve } from '@hono/node-server';
import { Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname, sep } from 'node:path';
import { z } from 'zod';
import { dateSchema } from './core/dates.js';
import { AppError } from './core/model.js';
import type { Runtime } from './runtime.js';
import { settingsRoutes } from './settings/routes.js';
import type { Probe } from './settings/probe.js';

export function createApp(runtime: Runtime, settingsProbe?: Probe) {
  const app = new Hono();
  app.use('*', compress());
  app.use('*', async (c, next) => {
    const url = new URL(c.req.url);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return c.json({ error: 'LOCAL_HOST_REQUIRED' }, 403);
    const origin = c.req.header('Origin');
    if (origin && origin !== url.origin) return c.json({ error: 'SAME_ORIGIN_REQUIRED' }, 403);
    c.header('Cache-Control', 'no-store'); c.header('X-Content-Type-Options', 'nosniff');
    c.header('Referrer-Policy', 'no-referrer');
    c.header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    await next();
  });
  app.onError((error, c) => c.json({ error: error instanceof AppError ? error.code : error instanceof z.ZodError ? 'INPUT_INVALID' : 'LOCAL_OPERATION_FAILED' }, error instanceof AppError && error.code.endsWith('NOT_FOUND') ? 404 : 400));
  app.use('/api/*', async (_c, next) => { await runtime.connections.reload(); await next(); });
  app.route('/api/settings', settingsRoutes(runtime, settingsProbe));
  app.get('/api/projects', (c) => c.json({ mode: runtime.demo ? 'demo' : 'live', projects: runtime.config.projects.map((p) => ({ id: p.id, name: p.name, timezone: p.timezone })) }));
  app.get('/api/status', async (c) => c.json((await runtime.queries(c.req.query('project') ?? '')).status()));
  app.get('/api/menu', async (c) => c.json((await runtime.queries(c.req.query('project') ?? '')).menu()));
  app.get('/api/calendar', async (c) => c.json((await runtime.queries(c.req.query('project') ?? '')).calendar(c.req.query('month') ?? '')));
  app.get('/api/release', async (c) => c.json((await runtime.queries(c.req.query('project') ?? '')).release(c.req.query('id') ?? '')));
  app.get('/api/guide', async (c) => {
    const query = await runtime.queries(c.req.query('project') ?? '');
    return c.json(query.guide(dateSchema.parse(c.req.query('at') ?? query.status().today), c.req.query('release')));
  });
  app.post('/api/refresh', async (c) => {
    if (c.req.header('X-Release-Calendar') !== 'local') return c.json({ error: 'LOCAL_REFRESH_HEADER_REQUIRED' }, 403);
    return c.json((await runtime.queries(c.req.query('project') ?? '', true)).status());
  });
  app.all('/api/*', (c) => c.json({ error: 'READ_ONLY_CONTRACT' }, 405));
  const root = fileURLToPath(new URL('../web-dist/', import.meta.url));
  app.get('/favicon.ico', (c) => c.body(null,204));
  app.get('*', async (c) => {
    const path = resolve(root, c.req.path === '/' ? 'index.html' : `.${c.req.path}`);
    if (!path.startsWith(root.endsWith(sep) ? root : `${root}${sep}`)) return c.notFound();
    try {
      const bytes = await readFile(path);
      const mime: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
      c.header('Content-Type', mime[extname(path)] ?? 'application/octet-stream');
      return c.body(bytes);
    } catch (error) { if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return c.notFound(); throw error; }
  });
  return app;
}
export function startServer(runtime: Runtime, port: number) {
  const server = serve({ fetch: createApp(runtime).fetch, hostname: '127.0.0.1', port }, (info) => {
    process.stdout.write(`Release Calendar: http://127.0.0.1:${info.port} (${runtime.demo ? 'demo' : 'live'})\nStop: Ctrl+C\n`);
  });
  const stop = () => { server.close(); if (server instanceof Server) server.closeAllConnections(); };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  return server;
}
