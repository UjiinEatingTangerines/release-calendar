import { defaultDataDir, type Project } from './config.js';
import { AppError } from './core/model.js';
import { Queries } from './core/query.js';
import { demoState } from './demo.js';
import { Connections } from './settings/connections.js';
import { Store } from './storage.js';
import { connectors, syncProject } from './sync.js';

export type RuntimeOptions = { readonly config?: string | undefined; readonly settingsPath?: string | undefined; readonly dataDir?: string | undefined; readonly demo?: boolean | undefined; readonly demoAt?: string | undefined };
export class Runtime {
  private constructor(readonly connections: Connections, readonly options: RuntimeOptions) {}
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
  async queries(id: string, refresh = false) {
    await this.connections.reload();
    const project = this.project(id);
    const now = this.options.demoAt ? new Date(`${this.options.demoAt}T03:00:00Z`) : new Date();
    const store = new Store(this.options.dataDir ?? defaultDataDir(), project);
    const state = this.demo ? demoState(now) : refresh ? await syncProject(project, store, { clients: connectors(project, this.connections.resolveSecret), now }) : await store.read();
    return new Queries(project, state, now);
  }
}
