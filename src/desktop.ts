import { startAutoSync } from './auto-sync.js';
import { Server } from 'node:http';
import { serve } from '@hono/node-server';
import { AppError } from './core/model.js';
import { Runtime } from './runtime.js';
import { createApp } from './server.js';

try {
  const config = process.env['RELEASE_CALENDAR_CONFIG'];
  const runtime = await Runtime.create(config ? { config } : {});
  const server = serve({ fetch: createApp(runtime).fetch, hostname: '127.0.0.1', port: 0 }, (info) => {
    process.stdout.write(`${JSON.stringify({ url: `http://127.0.0.1:${info.port}` })}\n`);
  });
  const stopSync = startAutoSync(() => runtime.syncAll());
  let stopping = false;
  const stop = () => {
    if (stopping) return; stopping = true; stopSync();
    void runtime.shutdown().finally(() => server.close(() => process.exit(0)));
    if (server instanceof Server) server.closeAllConnections();
    setTimeout(() => process.exit(0), 40000).unref();
  };
  // The app owns this pipe. EOF also cleans up after an app crash or force quit.
  process.stdin.resume(); process.stdin.once('end', stop);
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  server.once('error', () => { process.stderr.write('LOCAL_SERVER_FAILED\n'); process.exit(1); });
} catch (error) {
  if (!(error instanceof Error)) throw error;
  process.stderr.write(`${error instanceof AppError ? error.code : 'DESKTOP_START_FAILED'}\n`);
  process.exitCode = 1;
}
