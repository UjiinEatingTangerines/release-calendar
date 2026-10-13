import { describe, it, expect } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CodexAtlassian, type CodexConnection } from '../src/auth/codex.js';
import { OAuth } from '../src/auth/service.js';
import { AppError } from '../src/core/model.js';

describe('Codex shared authentication', () => {
  it('uses only explicit read tools without a model turn or credential export', async () => {
    const calls: { method: string; params: unknown }[] = [];
    const channel = { available: () => true, start: async () => {}, stop: () => {}, onNotification: (_method: string, _params: unknown) => {}, call: async (method: string, params: unknown) => {
      calls.push({ method, params });
      return method === 'thread/start' ? { thread: { id: 'fictional' } } : { content: [{ type: 'text', text: '{"values":[],"isLast":true}' }] };
    } };
    const bridge = new CodexAtlassian(channel);
    await expect(bridge.read('getJiraProjectVersions', { cloudId: 'fictional', projectIdOrKey: '100', startAt: 0, projectId: '100', malicious: 'ignored' })).resolves.toEqual({ values: [], isLast: true });
    expect(calls[1]).toEqual({ method: 'mcpServer/tool/call', params: { threadId: 'fictional', server: 'atlassian', tool: 'executeRead', arguments: { name: 'getJiraProjectVersions', cloudId: 'fictional', inputs: { projectIdOrKey: '100', startAt: 0 } } } });
    for (const name of ['executeWrite', 'executeRead', 'manageJiraProjectVersion', 'createJiraIssue']) await expect(bridge.read(name, {})).rejects.toMatchObject({ code: 'READ_ENDPOINT_NOT_ALLOWED' });
    expect(calls).toHaveLength(2); bridge.close();
  });
  it('matches the Codex login completion notification and rejects provider errors', async () => {
    let completed = false, stopped = 0;
    const channel = { available: () => true, start: async () => {}, stop: () => { stopped++; }, onNotification: (_method: string, _params: unknown) => {}, call: async (method: string) => method === 'thread/start' ? { thread: { id: 'fake' } } : method === 'mcpServer/oauth/login' ? { authorizationUrl: 'https://auth.atlassian.com/authorize', loginId: 'attempt' } : { isError: true, content: [] } };
    const bridge = new CodexAtlassian(channel);
    await bridge.login(success => { completed = success; });
    channel.onNotification('mcpServer/oauthLogin/completed', { name: 'atlassian', loginId: 'other', success: true }); expect(completed).toBe(false);
    channel.onNotification('mcpServer/oauthLogin/completed', { name: 'atlassian', loginId: 'attempt', success: true }); expect(completed).toBe(true); expect(stopped).toBe(1);
    await expect(bridge.read('getAccessibleAtlassianResources', {})).rejects.toMatchObject({ code: 'CODEX_READ_FAILED' });
  });
  it('reuses existing authentication, preserves the grant and only detaches on local logout', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'release-codex-test-'));
    let loginCalls = 0;
    const bridge: CodexConnection = { available: () => true, read: async () => [], login: async () => { loginCalls++; return ''; }, close: () => {} };
    const oauth = new OAuth(join(dir, 'auth.json'), undefined, undefined, undefined, bridge);
    const id = '11111111-1111-4111-8111-111111111111';
    try {
      await oauth.store.update(async d => ({ ...d, grants: [{ id, provider: 'jira', accessToken: null, createdAt: '2020-01-01' }] }));
      const result = await oauth.start('jira'); expect(result.url).toBeUndefined(); expect(oauth.status(result.id)).toMatchObject({ status: 'complete', grantId: id }); expect(loginCalls).toBe(0);
      expect((await oauth.view()).grants[0]?.reconnect).toBe(false);
      const stored = await readFile(join(dir, 'auth.json'), 'utf8'); expect(stored).toContain('"accessToken":null'); expect(stored).not.toContain('refreshToken');
      await oauth.forget(id); expect((await oauth.view()).grants[0]?.reconnect).toBe(true);
      await oauth.start('jira'); expect(loginCalls).toBe(0); expect((await oauth.view()).grants).toHaveLength(1);
    } finally { await oauth.shutdown(); await rm(dir, { recursive: true, force: true }); }
  });
  it('opens Codex login only after failed reuse and ignores completion after cancellation', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'release-codex-test-')); let finish: ((success: boolean) => void) | undefined;
    const bridge: CodexConnection = { available: () => true, read: async () => { throw new AppError('CODEX_READ_FAILED'); }, login: async callback => { finish = callback; return 'https://auth.atlassian.com/authorize'; }, close: () => {} };
    const oauth = new OAuth(join(dir, 'auth.json'), undefined, undefined, undefined, bridge);
    try {
      const result = await oauth.start('jira'); expect(result.url).toBe('https://auth.atlassian.com/authorize'); expect(oauth.status(result.id).status).toBe('pending');
      oauth.cancel(result.id); finish?.(true); expect(oauth.status(result.id).status).toBe('error'); expect((await oauth.view()).grants).toEqual([]);
    } finally { await oauth.shutdown(); await rm(dir, { recursive: true, force: true }); }
  });
});
