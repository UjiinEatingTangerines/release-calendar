import { tmpdir } from 'node:os';
import { z } from 'zod';
import { AppError } from '../core/model.js';
import { CodexRpc } from './codex-rpc.js';
const allowed = new Set(['getAccessibleAtlassianResources', 'listJiraProjects', 'getJiraProjectVersions', 'searchJiraIssuesUsingJql']);
const resultSchema = z.object({ isError: z.boolean().nullish(), structuredContent: z.unknown().optional(), content: z.array(z.object({ type: z.string(), text: z.string().optional() })).optional() });
function data(raw: unknown) {
  const result = resultSchema.parse(raw);
  if (result.isError) throw new AppError('CODEX_READ_FAILED');
  if (result.structuredContent != null) return result.structuredContent;
  try { return JSON.parse((result.content ?? []).filter(c => c.type === 'text').map(c => c.text ?? '').join('\n')) as unknown; }
  catch { throw new AppError('CODEX_RESPONSE_INVALID'); }
}
export interface CodexConnection {
  available(): boolean;
  read(name: string, args: Record<string, unknown>): Promise<unknown>;
  login(onComplete: (success: boolean) => void): Promise<string>;
  close(): void;
}
export class CodexAtlassian implements CodexConnection {
  private ready: Promise<string> | undefined;
  private completion: ((success: boolean) => void) | undefined;
  private loginId: string | undefined;
  constructor(private readonly rpc: Pick<CodexRpc, 'available' | 'start' | 'call' | 'stop' | 'onNotification'> = new CodexRpc()) {
    rpc.onNotification = (method, params) => {
      if (method !== 'mcpServer/oauthLogin/completed') return;
      const value = z.object({ name: z.string(), success: z.boolean(), loginId: z.string().nullish() }).safeParse(params);
      if (value.success && value.data.name === 'atlassian' && (!this.loginId || value.data.loginId === this.loginId)) {
        const callback = this.completion; this.completion = undefined; this.close(); callback?.(value.data.success);
      }
    };
  }
  available() { return this.rpc.available(); }
  private connect() {
    this.ready ??= (async () => {
      await this.rpc.start();
      const thread = z.object({ thread: z.object({ id: z.string() }) }).parse(await this.rpc.call('thread/start', { cwd: tmpdir(), ephemeral: true, approvalPolicy: 'never', sandbox: 'read-only', baseInstructions: 'Read-only MCP data bridge. No model turns.' }));
      return thread.thread.id;
    })().catch(error => { this.close(); throw error; });
    return this.ready;
  }
  async read(name: string, args: Record<string, unknown>): Promise<unknown> {
    if (!allowed.has(name)) throw new AppError('READ_ENDPOINT_NOT_ALLOWED');
    try {
      const threadId = await this.connect();
      let tool = name, inputs = args;
      if (name === 'listJiraProjects' || name === 'getJiraProjectVersions') {
        const keys = name === 'listJiraProjects' ? ['query', 'action', 'startAt', 'maxResults'] : ['projectIdOrKey', 'startAt', 'maxResults'];
        tool = 'executeRead'; inputs = { name, cloudId: z.string().parse(args['cloudId']), inputs: Object.fromEntries(Object.entries(args).filter(([key]) => keys.includes(key))) };
      }
      const value = data(await this.rpc.call('mcpServer/tool/call', { threadId, server: 'atlassian', tool, arguments: inputs }));
      if (name === 'getAccessibleAtlassianResources') {
        const resources = z.object({ data: z.object({ resources: z.array(z.object({ cloudId: z.string(), url: z.url() })) }) }).safeParse(value);
        if (resources.success) return resources.data.data.resources.map(r => ({ id: r.cloudId, url: r.url, name: new URL(r.url).hostname }));
      }
      return value;
    } catch (error) { this.close(); if (error instanceof AppError) throw error; throw new AppError('CODEX_RESPONSE_INVALID'); }
  }
  async login(onComplete: (success: boolean) => void) {
    await this.connect(); this.completion = onComplete;
    const result = z.object({ authorizationUrl: z.url(), loginId: z.string().nullish() }).parse(await this.rpc.call('mcpServer/oauth/login', { name: 'atlassian', timeoutSecs: 600 }));
    const url = new URL(result.authorizationUrl);
    if (url.protocol !== 'https:' || !['auth.atlassian.com', 'mcp.atlassian.com'].includes(url.hostname)) { this.close(); throw new AppError('CODEX_RESPONSE_INVALID'); }
    this.loginId = result.loginId ?? undefined;
    return result.authorizationUrl;
  }
  close() { this.ready = undefined; this.completion = undefined; this.loginId = undefined; this.rpc.stop(); }
}
