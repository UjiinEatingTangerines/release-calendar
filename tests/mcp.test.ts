import { describe, it, expect } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { z } from 'zod';
import { mcpRead, mcpProjects, mcpJiraReader } from '../src/auth/mcp.js';
import { OAuthTransport } from '../src/auth/transport.js';
import { OAuth } from '../src/auth/service.js';
import { collectJira } from '../src/connectors/jira.js';
import { demoProject } from '../src/demo.js';
const cloud = '11111111-1111-4111-8111-111111111111';

describe('Atlassian browser connection', () => {
  it('uses a public metadata client and exchanges a bound PKCE callback without a secret', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'release-mcp-'));
    const reservation = createServer(); await new Promise<void>(resolve => reservation.listen(0, '127.0.0.1', resolve));
    const address = reservation.address(); if (!address || typeof address === 'string') throw new Error('No port');
    await new Promise<void>(resolve => reservation.close(() => resolve()));
    const calls: Request[] = [];
    const transport = new OAuthTransport(async (input, init) => {
      const request = new Request(input, init); calls.push(request.clone());
      return Response.json(new URL(request.url).pathname === '/v1/register' ? { client_id: 'fictional-public' } : { access_token: 'fictional-access', token_type: 'Bearer', refresh_token: 'fictional-refresh', expires_in: 3600 });
    });
    const oauth = new OAuth(join(dir, 'auth.json'), transport, address.port);
    try {
      expect((await oauth.view()).apps.jira).toBe(true);
      const pending = await oauth.start('jira');
      const url = new URL(pending.url ?? '');
      expect(url.origin).toBe('https://auth.atlassian.com');
      expect(url.searchParams.get('code_challenge_method')).toBe('S256');
      expect(url.searchParams.get('scope')).not.toMatch(/write|delete|manage/);
      const response = await fetch(`${oauth.callback('jira')}?state=${url.searchParams.get('state')}&code=fictional`);
      expect(response.status).toBe(200);
      expect(calls[0]?.url).toBe('https://auth.atlassian.com/oauth/token');
      const exchanged = new URLSearchParams(await calls[0]?.text());
      expect(exchanged.get('resource')).toBe('https://mcp.atlassian.com/v2/mcp');
      expect(exchanged.has('client_secret')).toBe(false);
      expect(exchanged.get('code_verifier')).toBeTruthy();
      const completed = oauth.status(pending.id);
      expect(completed.status).toBe('complete');
      expect(JSON.stringify(await oauth.view())).not.toContain('fictional-access');
      if (!completed.grantId) throw new Error('No grant');
      const reopened = new OAuth(join(dir, 'auth.json'), transport, address.port);
      expect(await reopened.isMcp(completed.grantId)).toBe(true);
      expect(await reopened.access(completed.grantId, 'jira')).toBe('fictional-access');
      expect(await readFile(join(dir, 'auth.json'), 'utf8')).not.toContain('client_secret');
    } finally { oauth.close(); await rm(dir, { recursive: true, force: true }); }
  });
  it('marks legacy MCP grants for reconnect without sending their token to v2', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'release-legacy-'));
    const oauth = new OAuth(join(dir, 'auth.json'));
    const id = '11111111-1111-4111-8111-111111111112';
    try {
      await oauth.store.update(async doc => ({ ...doc, clients: { jira: { clientId: 'old', clientSecret: '', kind: 'mcp' } }, grants: [{ id, provider: 'jira', accessToken: 'old-token', createdAt: new Date().toISOString() }] }));
      expect((await oauth.view()).grants[0]?.reconnect).toBe(true);
      await expect(oauth.access(id, 'jira')).rejects.toMatchObject({ code: 'OAUTH_REAUTHORIZE' });
    } finally { oauth.close(); await rm(dir, { recursive: true, force: true }); }
  });
  it('unwraps v2 data envelopes without losing pagination', async () => {
    const result = await mcpProjects(async (_name, args) => ({ data: { values: [{ id: String(args['startAt']), key: 'DEMO', name: 'Fictional' }], isLast: args['startAt'] === 1 } }), cloud);
    expect(result.map(item => item.id)).toEqual(['0', '1']);
  });
  it('cancels an in-flight provider request when the app shuts down', async () => {
    const abort = new AbortController();
    let entered: () => void = () => {};
    const started = new Promise<void>(resolve => { entered = resolve; });
    const result = mcpRead('fictional', 'getAccessibleAtlassianResources', {}, async (_input, init) => {
      entered();
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      });
    }, abort.signal);
    const rejected = expect(result).rejects.toMatchObject({ code: 'MCP_CONNECTION_FAILED' });
    await started; abort.abort(); await rejected;
  });
  it('never calls the provider for a mutation tool', async () => {
    let called = false;
    await expect(mcpRead('fictional', 'manageJiraProjectVersion', {}, async () => { called = true; return Response.json({}); })).rejects.toMatchObject({ code: 'READ_ENDPOINT_NOT_ALLOWED' });
    expect(called).toBe(false);
  });
  it('uses MCP initialize, paginated catalog and an allowlisted read over the wire', async () => {
    const methods: string[] = [], names: string[] = [];
    const value = await mcpRead('fictional', 'getAccessibleAtlassianResources', {}, async (input, init) => {
      const request = new Request(input, init);
      if (request.method !== 'POST') return new Response(null, { status: 405 });
      const rpc = await request.json() as { method: string; id?: number; params?: { cursor?: string; name?: string } }; methods.push(rpc.method);
      if (rpc.id === undefined) return new Response(null, { status: 202 });
      let result: unknown;
      if (rpc.method === 'initialize') result = { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'fixture', version: '1' } };
      else if (rpc.method === 'tools/list') result = rpc.params?.cursor ? { tools: [{ name: 'getAccessibleAtlassianResources', inputSchema: { type: 'object', properties: {} } }] } : { tools: [], nextCursor: 'next' };
      else { names.push(rpc.params?.name ?? ''); result = { content: [{ type: 'text', text: JSON.stringify([{ id: cloud }]) }] }; }
      return Response.json({ jsonrpc: '2.0', id: rpc.id, result });
    });
    expect(value).toEqual([{ id: cloud }]);
    expect(methods.filter(m => m === 'tools/list')).toHaveLength(2);
    expect(names).toEqual(['getAccessibleAtlassianResources']);
  });
  it('redacts provider errors', async () => {
    await expect(mcpRead('fictional-secret', 'getAccessibleAtlassianResources', {}, async () => { throw new Error('private provider content'); })).rejects.toMatchObject({ code: 'MCP_CONNECTION_FAILED', message: 'MCP_CONNECTION_FAILED' });
  });
  it('collects all project pages and rejects repeated pages', async () => {
    const pages: number[] = [];
    const result = await mcpProjects(async (_name, args) => {
      pages.push(Number(args['startAt']));
      return args['startAt'] === 0 ? { values: [{ id: '1', key: 'A', name: 'A' }], isLast: false } : { values: [{ id: '2', key: 'B', name: 'B' }], isLast: true };
    }, cloud);
    expect(result.map(p => p.id)).toEqual(['1', '2']); expect(pages).toEqual([0, 1]);
    await expect(mcpProjects(async () => ({ values: [{ id: '1', key: 'A', name: 'A' }], isLast: false }), cloud)).rejects.toMatchObject({ code: 'PAGINATION_LOOP' });
  });
  it('feeds released, archived, future and undated versions through the shared Jira model', async () => {
    const reader = mcpJiraReader(cloud, 'ORBIT', async name => {
      if (name === 'listJiraProjects') return [{ id: '100', key: 'ORBIT', name: 'Fictional' }];
      if (name === 'getJiraProjectVersions') return [
        { id: '1', name: 'Past', released: true, archived: true, releaseDate: '2025-12-01' },
        { id: '2', name: 'Future', released: false, archived: false, releaseDate: '2028-02-29' },
        { id: '3', name: 'Undated', released: false, archived: false },
      ];
      return { issues: [], isLast: true };
    });
    const data = await collectJira(reader, { ...demoProject, jira: { ...demoProject.jira, projectKey: 'ORBIT' } });
    expect(data.releases.map(r => [r.versionId, r.released, r.archived, r.releaseDate])).toEqual([['1', true, true, '2025-12-01'], ['2', false, false, '2028-02-29'], ['3', false, false, null]]);
  });
  it('restores provider custom field IDs and omitted null assignees for date mappings', async () => {
    const reader = mcpJiraReader(cloud, 'ORBIT', async () => ({ data: { issues: [{ id: '1', fields: { customFields: { 'Start': { id: 'customfield_10015', value: '2027-03-01' } } } }], isLast: true } }));
    const result = await reader.get('/rest/api/3/search/jql', z.object({ issues: z.array(z.object({ fields: z.object({ customfield_10015: z.string(), assignee: z.null() }) })) }));
    expect(result.issues[0]?.fields).toEqual({ customfield_10015: '2027-03-01', assignee: null });
  });
  it('fails closed on incomplete issue pages instead of recording empty data', async () => {
    const reader = mcpJiraReader(cloud, 'ORBIT', async () => ({ issues: [] }));
    await expect(reader.get('/rest/api/3/search/jql', z.object({ issues: z.array(z.unknown()), isLast: z.boolean() }))).rejects.toThrow();
  });
  it('rejects arbitrary API paths', async () => {
    const reader = mcpJiraReader(cloud, 'ORBIT', async () => { throw new Error('Must not call'); });
    await expect(reader.get('/rest/api/3/issue/ORBIT-1', z.unknown())).rejects.toMatchObject({ code: 'READ_ENDPOINT_NOT_ALLOWED' });
  });
});
