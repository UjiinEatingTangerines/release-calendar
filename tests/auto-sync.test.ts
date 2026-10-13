import { describe, it, expect, vi } from 'vitest';
import { startAutoSync } from '../src/auto-sync.js';

describe('automatic synchronization', () => {
  it('runs on startup and again after five minutes, then stops', async () => {
    vi.useFakeTimers();
    let calls = 0;
    const stop = startAutoSync(async () => { calls++; });
    try {
      await vi.advanceTimersByTimeAsync(0);
      expect(calls).toBe(1);
      await vi.advanceTimersByTimeAsync(299999);
      expect(calls).toBe(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(calls).toBe(2);
      stop(); await vi.advanceTimersByTimeAsync(600000);
      expect(calls).toBe(2);
    } finally { stop(); vi.useRealTimers(); }
  });
  it('does not overlap a slow request or schedule again after stopping mid-flight', async () => {
    vi.useFakeTimers();
    let finish: () => void = () => {};
    let calls = 0;
    const pending = new Promise<void>(resolve => { finish = resolve; });
    const stop = startAutoSync(async () => { calls++; await pending; });
    try {
      await vi.advanceTimersByTimeAsync(600000);
      expect(calls).toBe(1);
      stop(); finish(); await vi.advanceTimersByTimeAsync(600000);
      expect(calls).toBe(1);
    } finally { stop(); finish(); vi.useRealTimers(); }
  });
  it('reports failure without leaking content and retries at the normal interval', async () => {
    vi.useFakeTimers(); let calls = 0, errors = 0;
    const stop = startAutoSync(async () => { calls++; if (calls === 1) throw new Error('private response'); }, 300000, () => { errors++; });
    try {
      await vi.advanceTimersByTimeAsync(300000);
      expect({ calls, errors }).toEqual({ calls: 2, errors: 1 });
    } finally { stop(); vi.useRealTimers(); }
  });
});

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { Runtime } from '../src/runtime.js';
import { OAuthTransport } from '../src/auth/transport.js';
import { demoProject } from '../src/demo.js';
import { createApp } from '../src/server.js';

it('automatically collects a provider release into HTTP and shares concurrent manual synchronization', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'release-auto-'));
  let versionReads = 0;
  const rpcSchema = z.object({ method: z.string(), id: z.union([z.number(), z.string()]).optional(), params: z.object({ name: z.string().optional() }).optional() });
  const transport = new OAuthTransport(async (input, init) => {
    const request = new Request(input, init);
    if (request.method !== 'POST') return new Response(null, { status: 405 });
    const rpc = rpcSchema.parse(await request.json());
    if (rpc.id === undefined) return new Response(null, { status: 202 });
    let result: unknown;
    if (rpc.method === 'initialize') result = { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'fictional', version: '1' } };
    else if (rpc.method === 'tools/list') result = { tools: ['listJiraProjects', 'getJiraProjectVersions', 'searchJiraIssuesUsingJql'].map(name => ({ name, inputSchema: { type: 'object', properties: {} } })) };
    else {
      const name = rpc.params?.name;
      if (name === 'getJiraProjectVersions') versionReads++;
      const data = name === 'listJiraProjects' ? { values: [{ id: '100', key: demoProject.jira.projectKey, name: 'Fictional' }], isLast: true }
        : name === 'getJiraProjectVersions' ? { values: [{ id: '99', name: 'Fictional launch', startDate: '2027-03-01', releaseDate: '2027-03-16', released: false, archived: false }], startAt: 0, isLast: true }
        : { issues: [], isLast: true };
      result = { content: [{ type: 'text', text: JSON.stringify({ data }) }] };
    }
    return Response.json({ jsonrpc: '2.0', id: rpc.id, result });
  });
  const runtime = await Runtime.create({ settingsPath: join(dir, 'connections.json'), dataDir: join(dir, 'data'), oauthTransport: transport });
  const grantId = '11111111-1111-4111-8111-111111111112';
  try {
    await runtime.oauth.store.update(async doc => ({ ...doc, clients: { jira: { clientId: 'fictional', clientSecret: '', kind: 'mcp-v2' } }, grants: [{ id: grantId, provider: 'jira', accessToken: 'fictional', createdAt: new Date().toISOString() }] }));
    await runtime.connections.save({ revision: (await runtime.connections.view()).revision, credentials: {}, project: { ...demoProject, jira: { ...demoProject.jira, cloudId: '11111111-1111-4111-8111-111111111111', oauthGrant: grantId }, github: { repositories: [] } } });
    await Promise.all([runtime.syncAll(), runtime.queries(demoProject.id, true)]);
    const response = await createApp(runtime).request(`http://localhost/api/calendar?project=${demoProject.id}&month=2027-03`);
    const calendar = z.object({ releases: z.array(z.object({ versionId: z.string(), releaseDate: z.string() })), warnings: z.array(z.string()) }).parse(await response.json());
    expect(calendar.releases).toEqual([{ versionId: '99', releaseDate: '2027-03-16' }]);
    expect(calendar.warnings).toEqual([]);
    expect(versionReads).toBe(1);
  } finally { runtime.oauth.close(); await rm(dir, { recursive: true, force: true }); }
});
