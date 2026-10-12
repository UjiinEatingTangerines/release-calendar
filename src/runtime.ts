import { defaultConfigPath, defaultDataDir, readConfig, type Config, type Project } from './config.js';
import { AppError } from './core/model.js';
import { Queries } from './core/query.js';
import { demoProject, demoState } from './demo.js';
import { Store } from './storage.js';
import { connectors, syncProject } from './sync.js';

export type RuntimeOptions = { readonly config?: string | undefined; readonly dataDir?: string | undefined; readonly demo?: boolean | undefined; readonly demoAt?: string | undefined };
export class Runtime {
  private constructor(readonly config: Config, readonly options: RuntimeOptions, readonly demo: boolean) {}
  static async create(options: RuntimeOptions) {
    const demo = options.demo === true || !options.config;
    if (options.demo && options.config) throw new AppError('DEMO_AND_CONFIG_ARE_EXCLUSIVE');
    if (options.demoAt && !demo) throw new AppError('DEMO_AT_REQUIRES_DEMO');
    return new Runtime(demo ? { projects: [demoProject] } : await readConfig(options.config ?? defaultConfigPath()), options, demo);
  }
  project(id: string): Project {
    const project = this.config.projects.find((p) => p.id === id);
    if (!project) throw new AppError('PROJECT_NOT_FOUND');
    return project;
  }
  async queries(id: string, refresh = false) {
    const project = this.project(id);
    const now = this.options.demoAt ? new Date(`${this.options.demoAt}T03:00:00Z`) : new Date();
    const store = new Store(this.options.dataDir ?? defaultDataDir(), project);
    const state = this.demo ? demoState(now) : refresh ? await syncProject(project, store, { clients: connectors(project), now }) : await store.read();
    return new Queries(project, state, now);
  }
}
