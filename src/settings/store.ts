import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { projectSchema } from '../config.js';
import { AppError } from '../core/model.js';

const credentialsSchema = z.record(z.string().regex(/^[A-Z][A-Z0-9_]*$/), z.string().min(1));
const documentSchema = z.object({ version: z.literal(1), revision: z.string(), projects: z.array(projectSchema), credentials: credentialsSchema });
export type ConnectionDocument = z.infer<typeof documentSchema>;
export async function privateJSON(path: string): Promise<unknown | undefined> {
  try {
    const info = await stat(path);
    if ((info.mode & 0o077) !== 0 || info.uid !== process.getuid?.()) throw new AppError('CREDENTIAL_FILE_REQUIRES_OWNER_ONLY_PERMISSIONS');
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined;
    if (error instanceof AppError) throw error;
    if (error instanceof Error) throw new AppError('LOCAL_SETTINGS_INVALID'); throw error;
  }
}
export async function legacyCredentials(path: string, allowed: readonly string[]) {
  const raw = await privateJSON(path);
  if (raw === undefined) return {};
  const values = credentialsSchema.parse(raw);
  if (Object.keys(values).some((key) => !allowed.includes(key))) throw new AppError('CREDENTIAL_NAME_NOT_CONFIGURED');
  return values;
}
export class ConnectionStore {
  constructor(readonly path: string) {}
  async read(): Promise<ConnectionDocument | undefined> {
    const raw = await privateJSON(this.path);
    if (raw === undefined) return undefined;
    const parsed = documentSchema.safeParse(raw);
    if (!parsed.success) throw new AppError('LOCAL_SETTINGS_INVALID');
    return parsed.data;
  }
  async update(expected: string, initial: ConnectionDocument, change: (current: ConnectionDocument) => ConnectionDocument) {
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    const lock = `${this.path}.lock`, temporary = `${this.path}.${randomUUID()}.tmp`;
    try { await mkdir(lock, { mode: 0o700 }); }
    catch (error) { if (error instanceof Error && 'code' in error && error.code === 'EEXIST') throw new AppError('SETTINGS_BUSY'); throw error; }
    try {
      const current = await this.read() ?? initial;
      if (current.revision !== expected) throw new AppError('SETTINGS_CHANGED_RELOAD');
      const next = documentSchema.parse({ ...change(current), revision: randomUUID() });
      await writeFile(temporary, JSON.stringify(next), { mode: 0o600, flag: 'wx' });
      await rename(temporary, this.path); return next;
    } finally { await rm(temporary, { force: true }); await rm(lock, { recursive: true, force: true }); }
  }
}
