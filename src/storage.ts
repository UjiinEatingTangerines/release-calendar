import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Project } from './config.js';
import { AppError, stateSchema, type State, type Snapshot } from './core/model.js';

export function configHash(project: Project): string { return createHash('sha256').update(JSON.stringify(project)).digest('hex'); }
export function emptyState(hash: string): State {
  return { schemaVersion: 1, configHash: hash, current: null, history: [], firstObservedAt: null, lastAttemptAt: null, problems: [] };
}
export function recordSnapshot(state: State, snapshot: Snapshot): State {
  const content = (value: Snapshot | null) => value ? JSON.stringify({ releases: value.releases, tickets: value.tickets, pulls: value.pulls }) : '';
  const changed = content(state.current) !== content(snapshot);
  return { ...state, current: snapshot, firstObservedAt: state.firstObservedAt ?? snapshot.observedAt,
    history: changed ? [...state.history, snapshot] : state.history };
}
export class Store {
  readonly path: string;
  readonly hash: string;
  constructor(readonly directory: string, project: Project) {
    this.hash = configHash(project); this.path = join(directory, `${project.id}-${this.hash.slice(0,16)}.json`);
  }
  async read(): Promise<State> {
    try {
      const result = stateSchema.parse(JSON.parse(await readFile(this.path, 'utf8')));
      if (result.configHash !== this.hash) throw new AppError('CACHE_CONFIG_MISMATCH');
      return result;
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return emptyState(this.hash);
      if (error instanceof Error) throw new AppError('CACHE_INVALID_OR_UNREADABLE');
      throw error;
    }
  }
  async update(transform: (state: State) => Promise<State>): Promise<State> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const lock = `${this.path}.lock`;
    try { await mkdir(lock, { mode: 0o700 }); }
    catch (error) { if (error instanceof Error && 'code' in error && error.code === 'EEXIST') throw new AppError('SYNC_ALREADY_RUNNING'); throw error; }
    const temporary = `${this.path}.${randomUUID()}.tmp`;
    try {
      const next = await transform(await this.read());
      await writeFile(temporary, JSON.stringify(next), { mode: 0o600, flag: 'wx' });
      await rename(temporary, this.path);
      return next;
    } finally {
      await rm(temporary, { force: true });
      await rm(lock, { recursive: true, force: true });
    }
  }
}
