#!/usr/bin/env node
import { Command } from 'commander';
import { z } from 'zod';
import { dateSchema } from './core/dates.js';
import { AppError } from './core/model.js';
import { Runtime } from './runtime.js';
import { startServer } from './server.js';

const optionsSchema = z.object({ config: z.string().optional(), dataDir: z.string().optional(), demo: z.boolean().optional(),
  demoAt: dateSchema.optional(), project: z.string().default('demo'), json: z.boolean().default(false),
  month: z.string().optional(), at: dateSchema.optional(), release: z.string().optional(), port: z.coerce.number().int().min(0).max(65535).default(4317) });
const program = new Command().name('release-calendar').description('Read-only local Jira Cloud / GitHub calendar. Uses saved local connections, or fictional demo when unconfigured.').version('0.1.0');
for (const name of ['status', 'calendar', 'release', 'guide', 'sync', 'serve']) {
  const command = program.command(name).option('--config <path>', 'Local configuration JSON; enables live mode')
    .option('--data-dir <path>', 'Local cache and observation directory').option('--demo', 'Fictional data only')
    .option('--demo-at <date>', 'Anchor fictional data and clock to YYYY-MM-DD').option('--project <id>', 'Project alias', 'demo')
    .option('--json', 'JSON output');
  if (name === 'release') command.argument('<id>', 'Stable release ID from calendar output');
  if (name === 'calendar') command.requiredOption('--month <month>', 'YYYY-MM');
  if (name === 'guide') command.option('--at <date>', 'Schedule evaluation date (latest snapshot)').option('--release <id>', 'One release only');
  if (name === 'serve') command.option('--port <port>', 'Loopback HTTP port', '4317');
  command.action(async (...args: unknown[]) => {
    const options = optionsSchema.parse(command.opts());
    const runtime = await Runtime.create(options);
    if (name === 'serve') { startServer(runtime, options.port); return; }
    try {
    const query = await runtime.queries(options.project, name === 'sync');
    const result = name === 'calendar' ? query.calendar(options.month ?? '') : name === 'release' ? query.release(z.string().parse(args[0]))
      : name === 'guide' ? query.guide(options.at ?? query.status().today, options.release) : query.status();
    process.stdout.write(`${JSON.stringify(result, null, options.json ? undefined : 2)}\n`);
    if (name === 'sync' && query.status().warnings.length) process.exitCode = 2;
    } finally { await runtime.shutdown(); }
  });
}
try { await program.parseAsync(); }
catch (error) {
  if (!(error instanceof Error)) throw error;
  process.stderr.write(`${JSON.stringify({ error: error instanceof AppError ? error.code : error instanceof z.ZodError ? 'INPUT_INVALID' : 'LOCAL_OPERATION_FAILED' })}\n`);
  process.exitCode = 1;
}
