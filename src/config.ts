import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { AppError } from './core/model.js';

import { configSchema, type Config } from './core/project.js';
export { configSchema, projectSchema, type Config, type Project } from './core/project.js';
export const defaultDataDir = () => resolve(process.env['RELEASE_CALENDAR_DATA_DIR'] ?? join(homedir(), '.local/share/release-calendar'));
export const defaultConfigPath = () => join(homedir(), '.config/release-calendar/config.json');
export async function readConfig(path: string): Promise<Config> {
  try { return configSchema.parse(JSON.parse(await readFile(path, 'utf8'))); }
  catch (error) { if (error instanceof Error) throw new AppError('CONFIG_INVALID_OR_UNREADABLE'); throw error; }
}
export function secret(name: string): string {
  const value = process.env[name];
  if (!value) throw new AppError('CREDENTIAL_MISSING');
  return value;
}
