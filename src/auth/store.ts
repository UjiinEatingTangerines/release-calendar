import { mkdir, writeFile, rename, rm } from 'node:fs/promises';
import { setTimeout as wait } from 'node:timers/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { privateJSON } from '../settings/store.js';
import { AppError } from '../core/model.js';
import { authDocumentSchema, type AuthDocument } from './model.js';

export class AuthStore {
  constructor(readonly path: string) {}
  async read(): Promise<AuthDocument> {
    const raw = await privateJSON(this.path);
    if (raw === undefined) return { version: 1, clients: {}, grants: [] };
    const value = authDocumentSchema.safeParse(raw);
    if (!value.success) throw new AppError('OAUTH_FILE_INVALID');
    return value.data;
  }
  async update(change: (current: AuthDocument) => Promise<AuthDocument>): Promise<AuthDocument> {
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    const lock = `${this.path}.lock`, temporary = `${this.path}.${randomUUID()}.tmp`;
    const deadline = Date.now() + 20000;
    for (;;) {
      try { await mkdir(lock, { mode: 0o700 }); break; }
      catch (error) {
        if (!(error instanceof Error) || !('code' in error) || error.code !== 'EEXIST') throw error;
        if (Date.now() >= deadline) throw new AppError('OAUTH_BUSY');
        await wait(100);
      }
    }
    try {
      const next = authDocumentSchema.parse(await change(await this.read()));
      await writeFile(temporary, JSON.stringify(next), { mode: 0o600, flag: 'wx' });
      await rename(temporary, this.path); return next;
    } finally { await rm(temporary, { force: true }); await rm(lock, { recursive: true, force: true }); }
  }
}
