import { diagnostics } from './diagnostics.js';
import type { z } from 'zod';
import { defaultDataDir, type Project } from './config.js';
import type { State } from './core/model.js';
import { AppError } from './core/model.js';
import { Queries } from './core/query.js';
import { demoState } from './demo.js';
import type { GithubBrowser } from './auth/github-browser.js';
import type { OAuthTransport } from './auth/transport.js';
import { CodexAtlassian, type CodexConnection } from './auth/codex.js';
import { OAuth } from './auth/service.js';
import { Connections } from './settings/connections.js';
import { Store } from './storage.js';
import { connectors, syncProject } from './sync.js';

export type RuntimeOptions = { readonly codex?: CodexConnection; readonly githubBrowser?: GithubBrowser; readonly oauthTransport?: OAuthTransport; readonly oauthPort?: number; readonly config?: string | undefined; readonly settingsPath?: string | undefined; readonly dataDir?: string | undefined; readonly demo?: boolean | undefined; readonly demoAt?: string | undefined };
export class Runtime {
  readonly oauth: OAuth;
  private readonly syncAbort = new AbortController();
  private readonly syncing = new Map<string, Promise<State>>();
  private constructor(readonly connections: Connections, readonly options: RuntimeOptions) { this.oauth = new OAuth(`${connections.store.path}.oauth.json`, options.oauthTransport, options.oauthPort, options.githubBrowser, options.codex ?? (options.oauthTransport ? undefined : new CodexAtlassian())); }
  get config() { return this.connections.config; }
  get demo() { return this.connections.demo; }
  static async create(options: RuntimeOptions) {
    if (options.demo && options.config) throw new AppError('DEMO_AND_CONFIG_ARE_EXCLUSIVE');
    const connections = await Connections.open(options);
    if (options.demoAt && !connections.demo) throw new AppError('DEMO_AT_REQUIRES_DEMO');
    return new Runtime(connections, options);
  }
  project(id: string): Project {
    const project = this.config.projects.find((p) => p.id === id);
    if (!project) throw new AppError('PROJECT_NOT_FOUND');
    return project;
  }
  readers(project: Project, resolveSecret = this.connections.resolveSecret) {
    const clients = connectors(project, resolveSecret, (id, provider) => this.oauth.access(id, provider), this.syncAbort.signal);
    const { oauthGrant, cloudId, projectKey } = project.jira;
    if (!oauthGrant || !cloudId) return clients;
    const fallback = clients.jira();
    return { ...clients, jira: () => ({ get: async <T>(path: string, schema: z.ZodType<T>) => {
      const reader = await this.oauth.isMcp(oauthGrant) ? this.oauth.jiraReader(oauthGrant, cloudId, projectKey, this.syncAbort.signal) : fallback;
      return reader.get(path, schema);
    } }) };
  }
  async queries(id: string, refresh = false) {
    await this.connections.reload();
    const project = this.project(id);
    const now = this.options.demoAt ? new Date(`${this.options.demoAt}T03:00:00Z`) : new Date();
    const store = new Store(this.options.dataDir ?? defaultDataDir(), project);
    const clients = this.readers(project);
    const state = this.demo ? demoState(now) : refresh ? await this.sync(project, store, clients, now) : await store.read();
    return new Queries(project, state, now);
  }
  private sync(project: Project, store: Store, clients: ReturnType<Runtime['readers']>, now: Date) {
    this.syncAbort.signal.throwIfAborted();
    const key = store.path;
    const existing = this.syncing.get(key);
    if (existing) return existing;
    const task = syncProject(project, store, { clients, now }).finally(() => this.syncing.delete(key));
    this.syncing.set(key, task);
    return task;
  }
  async shutdown() {
    this.syncAbort.abort();
    await Promise.allSettled([...this.syncing.values(), this.oauth.shutdown()]);
    await diagnostics.flush();
  }
  async syncAll() {
    await this.connections.reload();
    if (this.demo) return;
    for (const project of this.config.projects) {
      if (this.syncAbort.signal.aborted) return;
      try { await this.queries(project.id, true); }
      catch (error) { if (!(error instanceof Error)) throw error; process.stderr.write('AUTO_SYNC_PROJECT_FAILED\n'); }
    }
  }

}
