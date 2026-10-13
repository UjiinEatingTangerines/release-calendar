import { describe, it, expect } from 'vitest';
import { mkdtemp, rm, stat, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { OAuth } from '../src/auth/service.js';
import { OAuthTransport } from '../src/auth/transport.js';
import { Runtime } from '../src/runtime.js';
import { createApp } from '../src/server.js';
import { Store } from '../src/storage.js';
import { demoProject, demoState } from '../src/demo.js';
import { settingsViewSchema, editableProjectSchema } from '../src/core/connection-model.js';
const cloud = '11111111-1111-4111-8111-111111111111';
async function fixture(fetcher?: typeof globalThis.fetch) {
  const dir = await mkdtemp(join(tmpdir(), 'release-oauth-'));
  const reservation = createServer(); await new Promise<void>(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const address = reservation.address(); if (!address || typeof address === 'string') throw new Error('Missing test port');
  await new Promise<void>(resolve => reservation.close(() => resolve()));
  const oauth = new OAuth(join(dir, 'oauth.json'), new OAuthTransport(fetcher), address.port);
  return { oauth, dir, cleanup: async () => { oauth.close(); await rm(dir, { recursive: true, force: true }); } };
}
const json = (value: unknown) => Response.json(value);
const token = { access_token: 'fictional-access', refresh_token: 'fictional-refresh', expires_in: 3600, token_type: 'Bearer' };
describe('Browser OAuth', () => {
  it('exchanges a state-bound callback once and exposes only safe grant metadata', async () => {
    // Given a locally registered app and a wire-level token response.
    const requests: Request[] = [];
    const f = await fixture(async input => { const request = new Request(input); requests.push(request); return json(token); });
    try {
      await f.oauth.configure('github', { clientId: 'fictional-client', clientSecret: 'fictional-secret' });
      const attempt = await f.oauth.start('github'), authorize = new URL(attempt.url ?? '');
      expect(authorize.searchParams.get('code_challenge_method')).toBe('S256');
      // When the browser returns a valid authorization code.
      const callback = new URL(f.oauth.callback('github')); callback.search = new URLSearchParams({ state: authorize.searchParams.get('state') ?? '', code: 'fictional-code' }).toString();
      expect((await fetch(callback)).status).toBe(200);
      // Then one auth POST is made, private storage survives restart, and no token is returned in metadata.
      expect(requests.map(r => [r.method, r.url])).toEqual([['POST', 'https://github.com/login/oauth/access_token']]);
      expect(f.oauth.status(attempt.id).status).toBe('complete');
      expect(JSON.stringify(await f.oauth.view())).not.toMatch(/fictional-access|fictional-refresh|fictional-secret/);
      expect((await stat(join(f.dir, 'oauth.json'))).mode & 0o777).toBe(0o600);
      const id = f.oauth.status(attempt.id).grantId; expect(id).toBeDefined();
      if (id) expect(await new OAuth(join(f.dir, 'oauth.json')).access(id, 'github')).toBe('fictional-access');
      await expect(fetch(callback)).rejects.toThrow();
    } finally { await f.cleanup(); }
  });
  it('rejects forged callback state without consuming the legitimate login', async () => {
    const f = await fixture(async () => json(token));
    try {
      // Given a pending authorization.
      await f.oauth.configure('jira', { clientId: 'fictional-client', clientSecret: 'fictional-secret' });
      const attempt = await f.oauth.start('jira');
      // When an unbound callback arrives.
      const response = await fetch(`${f.oauth.callback('jira')}?state=wrong&code=fictional`);
      // Then the attempt remains pending and no credential is stored.
      expect(response.status).toBe(400); expect(f.oauth.status(attempt.id).status).toBe('pending');
      expect((await f.oauth.view()).grants).toEqual([]);
    } finally { await f.cleanup(); }
  });
  it('handles denial and releases the callback listener', async () => {
    const f = await fixture(async () => { throw new Error('Token exchange must not run'); });
    try {
      // Given a pending login and its valid state.
      await f.oauth.configure('jira', { clientId: 'fictional-client', clientSecret: 'fictional-secret' });
      const attempt = await f.oauth.start('jira'), state = new URL(attempt.url ?? '').searchParams.get('state') ?? '';
      // When the user denies consent.
      await fetch(`${f.oauth.callback('jira')}?state=${state}&error=access_denied`);
      // Then only a safe error remains and the local callback server is closed.
      expect(f.oauth.status(attempt.id)).toMatchObject({ status: 'error', code: 'OAUTH_DENIED' });
      expect((await f.oauth.view()).grants).toEqual([]); await expect(fetch(f.oauth.callback('jira'))).rejects.toThrow();
    } finally { await f.cleanup(); }
  });
  it('cancels a login without changing existing grants', async () => {
    const f = await fixture();
    try {
      // Given a registered app and pending login.
      await f.oauth.configure('github', { clientId: 'fictional-client', clientSecret: 'fictional-secret' });
      const attempt = await f.oauth.start('github');
      // When cancellation is requested.
      f.oauth.cancel(attempt.id);
      // Then the callback is unavailable and the attempt is explicitly cancelled.
      expect(f.oauth.status(attempt.id)).toMatchObject({ status: 'error', code: 'OAUTH_CANCELLED' });
      await expect(fetch(f.oauth.callback('github'))).rejects.toThrow();
    } finally { await f.cleanup(); }
  });
  it('rotates an expired token once when two local consumers refresh concurrently', async () => {
    let posts = 0; const f = await fixture(async () => { posts++; return json(token); });
    try {
      // Given an expired grant shared by independent runtime instances.
      const id = randomUUID(); await f.oauth.store.update(async doc => ({ ...doc, clients: { jira: { clientId: 'fictional', clientSecret: 'fictional' } }, grants: [{ id, provider: 'jira', accessToken: 'old', refreshToken: 'old-refresh', expiresAt: 1, createdAt: '2027-01-01' }] }));
      const second = new OAuth(f.oauth.store.path, f.oauth.transport);
      // When both consumers require access.
      const results = await Promise.all([f.oauth.access(id, 'jira'), second.access(id, 'jira')]);
      // Then the rotating refresh token was consumed once and both get the updated token.
      expect(results).toEqual(['fictional-access', 'fictional-access']); expect(posts).toBe(1);
      expect(await readFile(f.oauth.store.path, 'utf8')).not.toContain('old-refresh');
    } finally { await f.cleanup(); }
  });
  it('accepts the documented Jira token shape without token_type', async () => {
    // Given the official Jira response fields rather than GitHub's token shape.
    const transport = new OAuthTransport(async () => json({ access_token: 'fictional', expires_in: 3600, scope: 'read:jira-work', refresh_token: 'fictional-refresh' }));
    // When an authorization code is exchanged, then the provider's Bearer contract is preserved.
    const result = await transport.token('jira', { clientId: 'fictional', clientSecret: 'fictional' }, { grant_type: 'authorization_code', code: 'fictional' });
    expect(result.accessToken).toBe('fictional'); expect(result.expiresAt).toBeGreaterThan(Date.now());
  });
  it('keeps an expired grant on exchange failure and requires explicit reauthorization', async () => {
    const f = await fixture(async () => json({ error: 'invalid_grant', error_description: 'fictional-sensitive-body' }));
    try {
      const id = randomUUID();
      // Given a refresh token that the provider rejects.
      await f.oauth.store.update(async doc => ({ ...doc, clients: { jira: { clientId: 'fictional', clientSecret: 'fictional' } }, grants: [{ id, provider: 'jira', accessToken: 'old', refreshToken: 'old-refresh', expiresAt: 1, createdAt: '2027-01-01' }] }));
      // When refresh is attempted, then errors are redacted and the last grant is not silently deleted.
      await expect(f.oauth.access(id, 'jira')).rejects.toMatchObject({ code: 'OAUTH_REAUTHORIZE' });
      expect((await f.oauth.store.read()).grants).toHaveLength(1);
    } finally { await f.cleanup(); }
  });
  it('discovers every Jira project page and only repositories installed with read-only access', async () => {
    const calls: string[] = [];
    const f = await fixture(async input => {
      const request = new Request(input), url = new URL(request.url); calls.push(request.method);
      if (url.pathname.includes('accessible-resources')) return json([{ id: cloud, name: 'Fictional', url: 'https://fictional.atlassian.net' }]);
      if (url.pathname.includes('/project/search')) return json({ values: [{ id: url.searchParams.get('startAt') === '0' ? '1' : '2', key: url.searchParams.get('startAt') === '0' ? 'ONE' : 'TWO', name: 'Fictional' }], total: 2, isLast: url.searchParams.get('startAt') !== '0' });
      if (url.pathname === '/user/installations') return json({ total_count: 1, installations: [{ id: 10, permissions: { contents: 'read', pull_requests: 'read' } }] });
      return json({ total_count: 1, repositories: [{ id: 12, full_name: 'fictional/repo' }] });
    });
    try {
      // Given authenticated providers returning multiple project pages.
      const jira = randomUUID(), github = randomUUID();
      await f.oauth.store.update(async doc => ({ ...doc, grants: [{ id: jira, provider: 'jira', accessToken: 'fictional', createdAt: '2027-01-01' }, { id: github, provider: 'github', accessToken: 'fictional', createdAt: '2027-01-01' }] }));
      // When selecting accessible resources.
      const projects = await f.oauth.projects(jira, cloud), repos = await f.oauth.repositories(github);
      // Then pagination is complete and all discovery requests were GETs.
      expect(projects.map(p => p.key)).toEqual(['ONE', 'TWO']); expect(repos.map(r => r.full_name)).toEqual(['fictional/repo']); expect(new Set(calls)).toEqual(new Set(['GET']));
    } finally { await f.cleanup(); }
  });
  it('refuses a GitHub installation with source write permissions', async () => {
    const f = await fixture(async () => json({ total_count: 1, installations: [{ id: 10, permissions: { contents: 'write' } }] }));
    try {
      const id = randomUUID(); await f.oauth.store.update(async doc => ({ ...doc, grants: [{ id, provider: 'github', accessToken: 'fictional', createdAt: '2027-01-01' }] }));
      await expect(f.oauth.repositories(id)).rejects.toMatchObject({ code: 'OAUTH_APP_REQUIRES_READ_ONLY' });
    } finally { await f.cleanup(); }
  });
  it('preserves the last observed schedule when an OAuth grant was removed', async () => {
    const f = await fixture();
    try {
      // Given cached source data for a project whose OAuth login no longer exists.
      const runtime = await Runtime.create({ demo: true, settingsPath: join(f.dir, 'connections.json'), dataDir: join(f.dir, 'data') });
      await runtime.connections.save({ revision: 'initial', credentials: {}, project: editableProjectSchema.parse({ ...demoProject, jira: { ...demoProject.jira, cloudId: cloud, oauthGrant: randomUUID() }, github: { ...demoProject.github, repositories: [] } }) });
      const expected = demoState(new Date('2027-03-10T00:00:00Z'));
      const store = new Store(join(f.dir, 'data'), runtime.project('demo'));
      await store.update(async () => ({ ...expected, configHash: store.hash }));
      // When a source refresh attempts to use the removed login.
      const query = await runtime.queries('demo', true);
      // Then authentication failure remains separate from the retained source snapshot.
      expect(query.status().warnings).toContain('jira:OAUTH_REAUTHORIZE');
      expect(query.status().dataAsOf).toBe(expected.current?.observedAt);
    } finally { await f.cleanup(); }
  });
  it('preserves cached schedules when the local OAuth document becomes invalid', async () => {
    const f = await fixture();
    try {
      const runtime = await Runtime.create({ demo: true, settingsPath: join(f.dir, 'connections.json'), dataDir: join(f.dir, 'data') });
      await runtime.connections.save({ revision: 'initial', credentials: {}, project: editableProjectSchema.parse({ ...demoProject, jira: { ...demoProject.jira, cloudId: cloud, oauthGrant: randomUUID() }, github: { ...demoProject.github, repositories: [] } }) });
      const expected = demoState(new Date('2027-03-10T00:00:00Z'));
      const store = new Store(join(f.dir, 'data'), runtime.project('demo'));
      await store.update(async () => ({ ...expected, configHash: store.hash }));
      await writeFile(runtime.oauth.store.path, '{}', { mode: 0o600 });
      const cached = await runtime.queries('demo');
      expect(cached.status().dataAsOf).toBe(expected.current?.observedAt);
      const refreshed = await runtime.queries('demo', true);
      expect(refreshed.status().warnings).toContain('jira:OAUTH_FILE_INVALID');
      expect(refreshed.status().dataAsOf).toBe(expected.current?.observedAt);
    } finally { await f.cleanup(); }
  });
  it('does not let a cancelled in-flight exchange store a grant', async () => {
    let release: (() => void) | undefined;
    const arrived = new Promise<void>(resolve => { release = resolve; });
    let finish: (() => void) | undefined;
    const blocked = new Promise<void>(resolve => { finish = resolve; });
    const f = await fixture(async () => { release?.(); await blocked; return json(token); });
    try {
      // Given an exchange that is waiting for its provider response.
      await f.oauth.configure('jira', { clientId: 'fictional', clientSecret: 'fictional' });
      const attempt = await f.oauth.start('jira'), state = new URL(attempt.url ?? '').searchParams.get('state') ?? '';
      const response = fetch(`${f.oauth.callback('jira')}?state=${state}&code=fictional`);
      await arrived;
      // When cancellation precedes the successful provider response.
      f.oauth.cancel(attempt.id); finish?.(); await response;
      // Then the cancelled authorization is never persisted.
      expect((await f.oauth.view()).grants).toEqual([]);
      expect(f.oauth.status(attempt.id)).toMatchObject({ status: 'error', code: 'OAUTH_CANCELLED' });
    } finally { finish?.(); await f.cleanup(); }
  });
  it('reconnects a logged-out grant under the same identifier used by existing projects', async () => {
    const f = await fixture(async () => json(token));
    try {
      // Given a persisted login that has been locally logged out.
      await f.oauth.configure('github', { clientId: 'fictional', clientSecret: 'fictional' });
      const id = randomUUID();
      await f.oauth.store.update(async doc => ({ ...doc, grants: [{ id, provider: 'github', accessToken: 'old', refreshToken: 'old-refresh', createdAt: '2027-01-01' }] }));
      await f.oauth.forget(id);
      expect(await readFile(f.oauth.store.path, 'utf8')).not.toContain('old-refresh');
      // When the same grant is reauthorized in the browser.
      const attempt = await f.oauth.start('github', id), state = new URL(attempt.url ?? '').searchParams.get('state') ?? '';
      await fetch(`${f.oauth.callback('github')}?state=${state}&code=fictional`);
      // Then no new grant ID is introduced and existing project references can use the new token.
      expect(f.oauth.status(attempt.id).grantId).toBe(id);
      expect((await f.oauth.view()).grants.map(g => g.id)).toEqual([id]);
      expect(await f.oauth.access(id, 'github')).toBe('fictional-access');
    } finally { await f.cleanup(); }
  });
  it('requires local CSRF authorization before storing app secrets', async () => {
    const f = await fixture();
    try {
      // Given the actual settings API.
      const runtime = await Runtime.create({ demo: true, settingsPath: join(f.dir, 'connections.json') }), app = createApp(runtime);
      const view = settingsViewSchema.parse(await (await app.request('http://localhost/api/settings')).json());
      const body = JSON.stringify({ provider: 'jira', clientId: 'fictional-client', clientSecret: 'fictional-secret' });
      // When an unauthorized request then an authorized local request reaches the route.
      expect((await app.request('http://localhost/api/settings/oauth/configure', { method: 'POST', body })).status).toBe(403);
      const response = await app.request('http://localhost/api/settings/oauth/configure', { method: 'POST', headers: { 'X-Release-Settings': view.csrf }, body });
      // Then app configuration succeeds without returning its secret.
      expect(response.status).toBe(200); expect(await response.text()).not.toContain('fictional-secret');
    } finally { await f.cleanup(); }
  });
});
