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
  it('registers a public client automatically and exchanges a bound PKCE callback without a secret', async () => {
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
      const url = new URL(pending.url);
      expect(url.origin).toBe('https://mcp.atlassian.com');
      expect(url.searchParams.get('code_challenge_method')).toBe('S256');
      expect(url.searchParams.get('scope')).not.toMatch(/write|delete|manage/);
      const response = await fetch(`${oauth.callback('jira')}?state=${url.searchParams.get('state')}&code=fictional`);
      expect(response.status).toBe(200);
      expect(await calls[0]?.json()).toMatchObject({ token_endpoint_auth_method: 'none', redirect_uris: [oauth.callback('jira')] });
      const exchanged = new URLSearchParams(await calls[1]?.text());
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
  it('fails closed on incomplete issue pages instead of recording empty data', async () => {
    const reader = mcpJiraReader(cloud, 'ORBIT', async () => ({ issues: [] }));
    await expect(reader.get('/rest/api/3/search/jql', z.object({ issues: z.array(z.unknown()), isLast: z.boolean() }))).rejects.toThrow();
  });
  it('rejects arbitrary API paths', async () => {
    const reader = mcpJiraReader(cloud, 'ORBIT', async () => { throw new Error('Must not call'); });
    await expect(reader.get('/rest/api/3/issue/ORBIT-1', z.unknown())).rejects.toMatchObject({ code: 'READ_ENDPOINT_NOT_ALLOWED' });
  });
});
