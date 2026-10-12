import { readFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Server } from 'node:http';
import { serve } from '@hono/node-server';
import { z } from 'zod';
import { defaultConfigPath } from './config.js';
import { AppError } from './core/model.js';
import { Runtime } from './runtime.js';
import { createApp } from './server.js';

async function exists(path: string) {
  try { await stat(path); return true; }
  catch (error) { if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false; throw error; }
}

// Finder launches do not inherit shell exports. Only configured credential names may be loaded.
async function loadCredentials(runtime: Runtime, path: string) {
  if (!await exists(path)) return;
  const info = await stat(path);
  if ((info.mode & 0o077) !== 0 || info.uid !== process.getuid?.()) throw new AppError('CREDENTIAL_FILE_REQUIRES_OWNER_ONLY_PERMISSIONS');
  const values = z.record(z.string().regex(/^[A-Z][A-Z0-9_]*$/), z.string().min(1)).parse(JSON.parse(await readFile(path, 'utf8')));
  const allowed = new Set(runtime.config.projects.flatMap((p) => [p.jira.emailEnv, p.jira.tokenEnv, p.github.tokenEnv]));
  for (const [name, value] of Object.entries(values)) {
    if (!allowed.has(name)) throw new AppError('CREDENTIAL_NAME_NOT_CONFIGURED');
    process.env[name] = value;
  }
}

try {
  const config = process.env['RELEASE_CALENDAR_CONFIG'] ?? defaultConfigPath();
  const configured = await exists(config);
  if (process.env['RELEASE_CALENDAR_CONFIG'] && !configured) throw new AppError('CONFIG_INVALID_OR_UNREADABLE');
  const runtime = await Runtime.create(configured ? { config } : { demo: true });
  if (!runtime.demo) await loadCredentials(runtime, join(dirname(config), 'credentials.json'));
  const server = serve({ fetch: createApp(runtime).fetch, hostname: '127.0.0.1', port: 0 }, (info) => {
    process.stdout.write(`${JSON.stringify({ url: `http://127.0.0.1:${info.port}` })}\n`);
  });
  let stopping = false;
  const stop = () => {
    if (stopping) return; stopping = true;
    server.close(() => process.exit(0));
    if (server instanceof Server) server.closeAllConnections();
    setTimeout(() => process.exit(0), 1500).unref();
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
