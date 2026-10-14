import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID, createHash } from 'node:crypto';
import { appendFile, mkdir, rename, stat, rm, chmod } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { z } from 'zod';

const reasonSchema = z.enum(['refresh_rejected', 'auth_required', 'rate_limited', 'timeout', 'network', 'rpc_failure', 'query_failure', 'unknown']);
const eventSchema = z.object({
  event: z.enum(['sync_start', 'sync_success', 'sync_failed', 'rpc_failed', 'auth_error', 'process_exit']),
  provider: z.enum(['jira', 'github']).optional(),
  stage: z.enum(['collect', 'refresh', 'initialize', 'thread/start', 'mcpServer/tool/call', 'mcpServer/oauth/login', 'other']).optional(),
  reason: reasonSchema.optional(),
  oauthError: z.enum(['invalid_grant', 'unauthorized_client', 'invalid_token']).optional(),
  operation: z.enum(['getAccessibleAtlassianResources', 'listJiraProjects', 'getJiraProjectVersions', 'searchJiraIssuesUsingJql']).optional(),
  sessionId: z.uuid().optional(), requestId: z.number().int().optional(), rpcCode: z.number().int().optional(),
  exitCode: z.number().int().nullable().optional(), preserved: z.boolean().optional(),
  lastGoodAt: z.iso.datetime().nullable().optional(), elapsedMs: z.number().nonnegative().optional(),
});
type Event = z.infer<typeof eventSchema>;
const context = new AsyncLocalStorage<{ traceId: string; projectRef: string }>();
export const bindDiagnostic = AsyncLocalStorage.bind;
export function diagnosticScope<T>(project: string, action: () => Promise<T>) {
  return context.run({ traceId: randomUUID(), projectRef: createHash('sha256').update(project).digest('hex').slice(0, 16) }, action);
}
export function diagnosticReason(value: string): z.infer<typeof reasonSchema> {
  if (/invalid_grant|unauthorized_client|refresh_token is invalid/i.test(value)) return 'refresh_rejected';
  if (/authorization required|authrequired|notloggedin|oauth_reauthorize|http_401/i.test(value)) return 'auth_required';
  if (/429|rate.limit/i.test(value)) return 'rate_limited';
  if (/timeout|timed? out/i.test(value)) return 'timeout';
  if (/network|connection.failed|ECONN|ENOTFOUND/i.test(value)) return 'network';
  if (/rpc/i.test(value)) return 'rpc_failure';
  return 'unknown';
}
export class Diagnostics {
  private queue: Promise<void> = Promise.resolve();
  constructor(readonly path = join(homedir(), '.local/state/release-calendar/diagnostics.jsonl'), private readonly maxBytes = 1024 * 1024, private readonly enabled = true) {}
  record(input: Event) {
    if (!this.enabled) return;
    const parsed = eventSchema.safeParse(input); if (!parsed.success) return;
    const entry = JSON.stringify({ at: new Date().toISOString(), level: ['sync_start', 'sync_success', 'process_exit'].includes(parsed.data.event) ? 'info' : 'warn', ...context.getStore(), ...parsed.data }) + '\n';
    this.queue = this.queue.then(async () => {
      await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
      const size = await stat(this.path).then(s => s.size, () => 0);
      if (size + Buffer.byteLength(entry) > this.maxBytes) {
        await rm(`${this.path}.2`, { force: true });
        await rename(`${this.path}.1`, `${this.path}.2`).catch(() => {});
        await rename(this.path, `${this.path}.1`).catch(() => {});
      }
      await appendFile(this.path, entry, { mode: 0o600 }); await chmod(this.path, 0o600);
    }).catch(() => { process.stderr.write('DIAGNOSTIC_WRITE_FAILED\n'); });
  }
  flush() { return this.queue; }
}
export const diagnostics = new Diagnostics(undefined, undefined, !process.env['VITEST']);
