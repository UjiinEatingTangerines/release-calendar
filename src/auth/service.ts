import { createServer, type Server } from 'node:http';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { z } from 'zod';
import { AppError } from '../core/model.js';
import { AuthStore } from './store.js';
import { OAuthTransport, expired } from './transport.js';
import { siteSchema, choiceSchema, repoSchema, type Provider, type AttemptView, type Client } from './model.js';

export class OAuth {
  readonly store: AuthStore;
  private listener: Server | undefined;
  private timeout: ReturnType<typeof setTimeout> | undefined;
  private readonly attempts = new Map<string, AttemptView>();
  constructor(path: string, readonly transport = new OAuthTransport(), readonly port = 4318) { this.store = new AuthStore(path); }
  callback(provider: Provider) { return `http://127.0.0.1:${this.port}/callback/${provider}`; }
  async view() {
    const doc = await this.store.read();
    return { apps: { jira: !!doc.clients.jira, github: !!doc.clients.github }, callback: `http://127.0.0.1:${this.port}/callback/`, grants: doc.grants.map(g => ({ id: g.id, provider: g.provider, createdAt: g.createdAt, reconnect: !g.accessToken || (expired(g) && !g.refreshToken) })) };
  }
  async configure(provider: Provider, client: Client) {
    if (this.listener) throw new AppError('OAUTH_IN_PROGRESS');
    await this.store.update(async doc => ({ ...doc, clients: { ...doc.clients, [provider]: client }, grants: doc.grants.map(g => g.provider === provider ? { id: g.id, provider: g.provider, createdAt: g.createdAt, accessToken: null } : g) }));
  }
  async forget(id: string) { await this.store.update(async doc => ({ ...doc, grants: doc.grants.map(g => g.id === id ? { id: g.id, provider: g.provider, createdAt: g.createdAt, accessToken: null } : g) })); }
  async access(id: string, provider: Provider): Promise<string> {
    const doc = await this.store.read(), grant = doc.grants.find(g => g.id === id && g.provider === provider);
    if (!grant?.accessToken) throw new AppError('OAUTH_REAUTHORIZE');
    if (!expired(grant)) return grant.accessToken;
    const updated = await this.store.update(async current => {
      const live = current.grants.find(g => g.id === id && g.provider === provider), client = current.clients[provider];
      if (!live?.accessToken || !client) throw new AppError('OAUTH_REAUTHORIZE');
      if (!expired(live)) return current;
      if (!live.refreshToken) throw new AppError('OAUTH_REAUTHORIZE');
      const refreshed = await this.transport.token(provider, client, { grant_type: 'refresh_token', refresh_token: live.refreshToken });
      return { ...current, grants: current.grants.map(g => g.id === id ? { ...g, ...refreshed } : g) };
    });
    const token = updated.grants.find(g => g.id === id)?.accessToken;
    if (!token) throw new AppError('OAUTH_REAUTHORIZE'); return token;
  }
  close() {
    if (this.timeout) clearTimeout(this.timeout);
    this.listener?.close(); this.listener?.closeIdleConnections(); this.listener = undefined;
  }
  cancel(id: string) { const attempt = this.attempts.get(id); if (attempt?.status === 'pending') { this.attempts.set(id, { id, status: 'error', code: 'OAUTH_CANCELLED' }); this.close(); } }
  status(id: string) { const result = this.attempts.get(id); if (!result) throw new AppError('OAUTH_ATTEMPT_NOT_FOUND'); return result; }
  async start(provider: Provider, replaceId?: string) {
    if (this.listener) throw new AppError('OAUTH_IN_PROGRESS');
    const current = await this.store.read(), client = current.clients[provider];
    if (replaceId && !current.grants.some(g => g.id === replaceId && g.provider === provider)) throw new AppError('OAUTH_REAUTHORIZE');
    if (!client) throw new AppError('OAUTH_APP_REQUIRED');
    if (this.listener) throw new AppError('OAUTH_IN_PROGRESS');
    let consumed = false;
    const id = randomUUID(), state = randomBytes(32).toString('hex'), verifier = randomBytes(32).toString('base64url');
    const listener = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      res.setHeader('Connection', 'close'); res.setHeader('Cache-Control', 'no-store'); res.setHeader('Referrer-Policy', 'no-referrer');
      res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
      if (req.method !== 'GET' || req.headers.host !== `127.0.0.1:${this.port}` || url.pathname !== `/callback/${provider}` || url.searchParams.get('state') !== state || consumed || this.status(id).status !== 'pending') { res.writeHead(400); res.end('Invalid login callback'); return; }
      // Consume the state before asynchronous exchange to prevent replay.
      consumed = true;
      void (async () => {
        try {
          const code = url.searchParams.get('code');
          if (url.searchParams.has('error') || !code) throw new AppError('OAUTH_DENIED');
          const tokens = await this.transport.token(provider, client, { grant_type: 'authorization_code', code, redirect_uri: this.callback(provider), ...(provider === 'github' ? { code_verifier: verifier } : {}) });
          const grantId = replaceId ?? randomUUID();
          await this.store.update(async doc => {
            if (this.status(id).status !== 'pending') throw new AppError('OAUTH_CANCELLED');
            if (doc.clients[provider]?.clientId !== client.clientId || doc.clients[provider]?.clientSecret !== client.clientSecret) throw new AppError('OAUTH_APP_CHANGED');
            return { ...doc, grants: [...doc.grants.filter(g => g.id !== grantId), { id: grantId, provider, ...tokens, createdAt: new Date().toISOString() }] };
          });
          this.attempts.set(id, { id, status: 'complete', grantId });
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end('<!doctype html><html lang="ko"><meta charset="utf-8"><title>연결 완료</title><h1>로그인을 완료했습니다.</h1><p>Release Calendar 설정 화면으로 돌아가 프로젝트와 저장소를 선택하세요. 이 탭은 닫아도 됩니다.</p></html>');
        } catch (error) {
          if (!(error instanceof Error)) throw error;
          this.attempts.set(id, { id, status: 'error', code: error instanceof AppError ? error.code : 'OAUTH_TOKEN_FAILED' });
          res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('로그인을 완료하지 못했습니다. 앱에서 다시 시도해 주세요.');
        } finally { if (this.listener === listener) this.close(); }
      })();
    });
    this.listener = listener;
    try { await new Promise<void>((resolve, reject) => { listener.once('error', reject); listener.listen(this.port, '127.0.0.1', () => resolve()); }); }
    catch (error) { this.close(); if (error instanceof Error) throw new AppError('OAUTH_CALLBACK_PORT_BUSY'); throw error; }
    listener.unref(); this.attempts.clear(); this.attempts.set(id, { id, status: 'pending' });
    this.timeout = setTimeout(() => { this.attempts.set(id, { id, status: 'error', code: 'OAUTH_EXPIRED' }); this.close(); }, 10 * 60 * 1000); this.timeout.unref();
    const url = new URL(provider === 'jira' ? 'https://auth.atlassian.com/authorize' : 'https://github.com/login/oauth/authorize');
    url.search = new URLSearchParams({ client_id: client.clientId, redirect_uri: this.callback(provider), response_type: 'code', state,
      ...(provider === 'jira' ? { audience: 'api.atlassian.com', scope: 'read:jira-work offline_access', prompt: 'consent' } : { scope: 'offline_access', code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' }) }).toString();
    return { id, url: url.toString() };
  }
  async sites(grant: string) { return this.transport.get('jira', '/oauth/token/accessible-resources', await this.access(grant, 'jira'), z.array(siteSchema)); }
  async projects(grant: string, cloudId: string) {
    if (!(await this.sites(grant)).some(s => s.id === cloudId)) throw new AppError('OAUTH_SITE_NOT_FOUND');
    const token = await this.access(grant, 'jira'), result: z.infer<typeof choiceSchema>[] = [];
    for (let start = 0; ; ) {
      const page = await this.transport.get('jira', `/ex/jira/${cloudId}/rest/api/3/project/search?startAt=${start}&maxResults=100`, token, z.object({ values: z.array(choiceSchema), isLast: z.boolean(), total: z.number() }));
      if (page.values.some(p => result.some(old => old.id === p.id))) throw new AppError('OAUTH_PAGINATION_INVALID');
      result.push(...page.values);
      if (page.isLast) return result;
      if (!page.values.length) throw new AppError('OAUTH_PAGINATION_INVALID'); start += page.values.length;
    }
  }
  async repositories(grant: string) {
    const token = await this.access(grant, 'github'), installations: number[] = [], repos = new Map<number, z.infer<typeof repoSchema>>();
    for (let page = 1; ; page++) {
      const data = await this.transport.get('github', `/user/installations?per_page=100&page=${page}`, token, z.object({ total_count: z.number(), installations: z.array(z.object({ id: z.number(), permissions: z.record(z.string(), z.string()) })) }));
      for (const install of data.installations) {
        if (installations.includes(install.id)) throw new AppError('OAUTH_PAGINATION_INVALID');
        if (Object.values(install.permissions).some(v => v !== 'read')) throw new AppError('OAUTH_APP_REQUIRES_READ_ONLY');
        installations.push(install.id);
      }
      if (installations.length >= data.total_count) break;
      if (!data.installations.length) throw new AppError('OAUTH_PAGINATION_INVALID');
    }
    for (const installation of installations) {
      const seen = new Set<number>();
      for (let page = 1; ; page++) {
        const data = await this.transport.get('github', `/user/installations/${installation}/repositories?per_page=100&page=${page}`, token, z.object({ total_count: z.number(), repositories: z.array(repoSchema) }));
        for (const repo of data.repositories) { if (seen.has(repo.id)) throw new AppError('OAUTH_PAGINATION_INVALID'); seen.add(repo.id); repos.set(repo.id, repo); }
        if (seen.size >= data.total_count) break;
        if (!data.repositories.length) throw new AppError('OAUTH_PAGINATION_INVALID');
      }
    }
    return [...repos.values()];
  }
}
