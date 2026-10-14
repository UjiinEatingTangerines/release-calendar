import { randomUUID } from 'node:crypto';
import { diagnostics, diagnosticReason, bindDiagnostic } from '../diagnostics.js';
import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import { accessSync, constants } from 'node:fs';
import { delimiter, join } from 'node:path';
import { tmpdir } from 'node:os';
import { z } from 'zod';
import { AppError } from '../core/model.js';

const messageSchema = z.object({ id: z.number().optional(), method: z.string().optional(), params: z.unknown().optional(), result: z.unknown().optional(), error: z.unknown().optional() });
export class CodexRpc {
  private child: ChildProcessWithoutNullStreams | undefined;
  private sequence = 0;
  private sessionId = randomUUID();
  private pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout>; failed: (value: unknown) => void }>();
  onNotification: (method: string, params: unknown) => void = () => {};
  constructor(private readonly executable = findCodex(), private readonly prefix: string[] = []) {}
  available() { return !!this.executable; }
  async start() {
    if (!this.executable) throw new AppError('CODEX_CLI_MISSING');
    await this.ensureServer(this.executable);
    const child = spawn(this.executable, [...this.prefix, 'app-server', '--stdio', '-c', 'mcp_servers={atlassian={url="https://mcp.atlassian.com/v2/mcp",enabled_tools=["getAccessibleAtlassianResources","searchJiraIssuesUsingJql","listJiraProjects","getJiraProjectVersions","executeRead"]}}', '-c', 'features.apps=false'], { cwd: tmpdir(), stdio: 'pipe', windowsHide: true });
    this.child = child;
    this.sessionId = randomUUID(); const sessionId = this.sessionId;
    let buffer = ''; const reported = new Set<string>();
    child.stderr.on('data', (chunk: Buffer) => {
      buffer = (buffer + chunk.toString('utf8')).slice(-8192);
      const lines = buffer.split('\n'); buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!/atlassian|oauth|refresh/i.test(line)) continue;
        const reason = diagnosticReason(line);
        if (reason === 'unknown' || reported.has(reason)) continue;
        const oauthError = z.enum(['invalid_grant', 'unauthorized_client', 'invalid_token']).safeParse(line.match(/invalid_grant|unauthorized_client|invalid_token/i)?.[0]?.toLowerCase());
        reported.add(reason); diagnostics.record({ event: 'auth_error', provider: 'jira', stage: /refresh/i.test(line) ? 'refresh' : 'other', reason, sessionId, ...(oauthError.success ? { oauthError: oauthError.data } : {}) });
      }
    });
    child.stdin.on('error', () => this.stop());
    child.on('error', () => this.stop());
    child.on('exit', code => { diagnostics.record({ event: 'process_exit', sessionId, exitCode: code }); if (this.child === child) this.stop(); });
    const lines = createInterface({ input: child.stdout });
    lines.on('line', line => {
      try {
        const parsed = messageSchema.safeParse(JSON.parse(line)); if (!parsed.success) return;
        const m = parsed.data;
        if (m.id !== undefined && this.pending.has(m.id)) {
          const waiter = this.pending.get(m.id); if (!waiter) return;
          this.pending.delete(m.id); clearTimeout(waiter.timer);
          if (m.error !== undefined) { waiter.failed(m.error); waiter.reject(new AppError('CODEX_RPC_FAILED')); } else waiter.resolve(m.result);
        } else if (m.id !== undefined && m.method) {
          child.stdin.write(JSON.stringify({ id: m.id, error: { code: -32601, message: 'Interactive tool requests are not supported' } }) + '\n');
        } else if (m.method) this.onNotification(m.method, m.params);
      } catch { this.stop(); }
    });
    child.once('close', () => lines.close());
    await this.call('initialize', { clientInfo: { name: 'release_calendar', version: '0.1.0' }, capabilities: { experimentalApi: true } });
    child.stdin.write(JSON.stringify({ method: 'initialized' }) + '\n');
  }
  private async ensureServer(executable: string) {
    const run = (args: string[]) => new Promise<string>((resolve, reject) => {
      execFile(executable, [...this.prefix, ...args], { cwd: tmpdir(), timeout: 15000, maxBuffer: 65536 }, (error, stdout, stderr) => {
        if (error) reject(new AppError(stderr.includes("No MCP server named 'atlassian' found") ? 'CODEX_MCP_MISSING' : 'CODEX_CONNECTION_FAILED'));
        else resolve(stdout);
      });
    });
    let raw: string;
    try { raw = await run(['mcp', 'get', 'atlassian', '--json']); }
    catch (error) {
      if (!(error instanceof AppError) || error.code !== 'CODEX_MCP_MISSING') throw error;
      await run(['mcp', 'add', 'atlassian', '--url', 'https://mcp.atlassian.com/v2/mcp']);
      raw = await run(['mcp', 'get', 'atlassian', '--json']);
    }
    const config = z.object({ enabled: z.boolean(), transport: z.object({ type: z.literal('streamable_http'), url: z.literal('https://mcp.atlassian.com/v2/mcp') }) }).safeParse(JSON.parse(raw));
    if (!config.success || !config.data.enabled) throw new AppError('CODEX_MCP_CONFIG_UNSUPPORTED');
  }
  call(method: string, params: unknown): Promise<unknown> {
    const child = this.child; if (!child) return Promise.reject(new AppError('CODEX_CONNECTION_FAILED'));
    return new Promise((resolve, reject) => {
      const id = ++this.sequence;
      const stage = ['initialize', 'thread/start', 'mcpServer/tool/call', 'mcpServer/oauth/login'].find(value => value === method) ?? 'other';
      const tool = z.object({ tool: z.string(), arguments: z.object({ name: z.string().optional() }).passthrough().optional() }).safeParse(params);
      const operation = z.enum(['getAccessibleAtlassianResources', 'listJiraProjects', 'getJiraProjectVersions', 'searchJiraIssuesUsingJql']).safeParse(tool.success ? tool.data.tool === 'executeRead' ? tool.data.arguments?.name : tool.data.tool : undefined);
      const failed = bindDiagnostic((value: unknown) => {
        const error = z.object({ code: z.number().int().optional(), message: z.string().optional() }).safeParse(value);
        diagnostics.record({ event: 'rpc_failed', provider: 'jira', stage: stage as 'initialize' | 'thread/start' | 'mcpServer/tool/call' | 'mcpServer/oauth/login' | 'other', sessionId: this.sessionId, requestId: id, ...(operation.success ? { operation: operation.data } : {}), reason: diagnosticReason(error.success ? error.data.message ?? 'rpc' : 'rpc'), ...(error.success && error.data.code !== undefined ? { rpcCode: error.data.code } : {}) });
      });
      const timer = setTimeout(() => { failed({ message: 'timeout' }); this.pending.delete(id); reject(new AppError('CODEX_TIMEOUT')); this.stop(); }, 45000);
      this.pending.set(id, { resolve, reject, timer, failed });
      child.stdin.write(JSON.stringify({ id, method, params }) + '\n');
    });
  }
  stop() {
    const child = this.child; this.child = undefined;
    for (const waiter of this.pending.values()) { clearTimeout(waiter.timer); waiter.reject(new AppError('CODEX_CONNECTION_FAILED')); }
    this.pending.clear();
    if (child) {
      child.stdin.end(); child.kill('SIGTERM');
      const timer = setTimeout(() => child.kill('SIGKILL'), 2000); timer.unref();
      child.once('close', () => clearTimeout(timer));
    }
  }
}
function findCodex() {
  const paths = [process.env['RELEASE_CALENDAR_CODEX'], ...(process.env['PATH'] ?? '').split(delimiter).filter(Boolean).map(p => join(p, 'codex')), '/opt/homebrew/bin/codex', '/usr/local/bin/codex'];
  for (const path of paths) { if (path) { try { accessSync(path, constants.X_OK); return path; } catch { /* Try the next CLI location. */ } } }
  return undefined;
}
