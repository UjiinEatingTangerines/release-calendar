import { Client as McpClient } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { z } from 'zod';
import { AppError } from '../core/model.js';
import type { Reader } from '../connectors/http.js';

export const mcpOrigin = 'https://mcp.atlassian.com';
const allowedTools = new Set(['getAccessibleAtlassianResources', 'listJiraProjects', 'getJiraProjectVersions', 'searchJiraIssuesUsingJql']);
const object = z.record(z.string(), z.unknown());
/** A closed read-tool allowlist; transport POSTs never imply permission to mutate Jira. */
export async function mcpRead(token: string, name: string, args: Record<string, unknown>, fetcher: typeof fetch = fetch): Promise<unknown> {
  if (!allowedTools.has(name)) throw new AppError('READ_ENDPOINT_NOT_ALLOWED');
  const client = new McpClient({ name: 'release-calendar', version: '0.1.0' });
  const transport = new StreamableHTTPClientTransport(new URL(`${mcpOrigin}/v2/mcp?tools=all`), {
    requestInit: { headers: { Authorization: `Bearer ${token}` }, redirect: 'error' },
    fetch: (input, init) => fetcher(input, { ...init, signal: AbortSignal.timeout(30000), redirect: 'error' }),
  });
  try {
    // SDK 1.x declares its sessionId getter wider than its own Transport interface.
    await client.connect(transport as Transport);
    let cursor: string | undefined;
    const seen = new Set<string>();
    let tool;
    do {
      const page = await client.listTools(cursor ? { cursor } : {});
      tool = page.tools.find(t => t.name === name);
      if (tool) break;
      cursor = page.nextCursor;
      if (cursor && seen.has(cursor)) throw new AppError('PAGINATION_LOOP');
      if (cursor) seen.add(cursor);
    } while (cursor);
    if (!tool) throw new AppError('MCP_READ_TOOL_UNAVAILABLE');
    // Use only parameters advertised by this server version; unsupported required fields fail closed.
    const properties = tool.inputSchema.properties ?? {};
    const selected = Object.fromEntries(Object.entries(args).filter(([key]) => key in properties));
    if (tool.inputSchema.required?.some(key => !(key in selected))) throw new AppError('MCP_TOOL_SCHEMA_UNSUPPORTED');
    const result = await client.callTool({ name, arguments: selected });
    if (result.isError) throw new AppError('MCP_READ_FAILED');
    if (result.structuredContent) return result.structuredContent;
    const content = z.array(z.object({ type: z.string(), text: z.string().optional() }).passthrough()).parse(result.content);
    const text = content.filter(c => c.type === 'text').map(c => c.text ?? '').join('\n');
    return JSON.parse(text) as unknown;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('MCP_CONNECTION_FAILED');
  } finally { await client.close(); }
}
export function unwrap(value: unknown): unknown {
  const parsed = object.safeParse(value);
  if (parsed.success && 'result' in parsed.data) return parsed.data['result'];
  return value;
}
export async function mcpProjects(call: (name: string, args: Record<string, unknown>) => Promise<unknown>, cloudId: string) {
  const items: { id: string; key: string; name: string }[] = [];
  const schema = z.object({ id: z.string(), key: z.string(), name: z.string() });
  for (let startAt = 0; ; ) {
    const raw = unwrap(await call('listJiraProjects', { cloudId, startAt, maxResults: 100 }));
    const page = object.safeParse(raw);
    const values = z.array(schema).parse(Array.isArray(raw) ? raw : page.success ? page.data['values'] ?? page.data['projects'] : undefined);
    if (values.some(v => items.some(old => old.id === v.id))) throw new AppError('PAGINATION_LOOP');
    items.push(...values);
    if (Array.isArray(raw) || (page.success && (page.data['isLast'] === true || (typeof page.data['total'] === 'number' && items.length >= page.data['total'])))) return items;
    if (!values.length) throw new AppError('PAGINATION_INCOMPLETE');
    startAt += values.length;
  }
}
export function mcpJiraReader(cloudId: string, projectKey: string, call: (name: string, args: Record<string, unknown>) => Promise<unknown>): Reader {
  return { async get(path, schema) {
    const url = new URL(path, 'https://local.invalid');
    if (/^\/rest\/api\/3\/project\/[A-Z0-9_]+$/.test(url.pathname)) {
      const project = (await mcpProjects(call, cloudId)).find(p => p.key === projectKey);
      if (!project) throw new AppError('PROJECT_NOT_FOUND');
      return schema.parse(project);
    }
    if (/^\/rest\/api\/3\/project\/\d+\/version$/.test(url.pathname)) {
      const projectId = url.pathname.split('/')[5];
      const startAt = Number(url.searchParams.get('startAt') ?? 0);
      const raw = unwrap(await call('getJiraProjectVersions', { cloudId, projectIdOrKey: projectId, projectId, projectKey, startAt, maxResults: 100 }));
      if (Array.isArray(raw)) return schema.parse({ values: raw, startAt: 0, isLast: true });
      return schema.parse(raw);
    }
    if (url.pathname === '/rest/api/3/search/jql') {
      const raw = unwrap(await call('searchJiraIssuesUsingJql', { cloudId, jql: url.searchParams.get('jql'), fields: url.searchParams.get('fields')?.split(','), maxResults: 100, ...(url.searchParams.has('nextPageToken') ? { nextPageToken: url.searchParams.get('nextPageToken') } : {}) }));
      return schema.parse(raw);
    }
    throw new AppError('READ_ENDPOINT_NOT_ALLOWED');
  } };
}
