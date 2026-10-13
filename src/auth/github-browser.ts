import { spawn, execFile } from 'node:child_process';
import { accessSync, constants } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, delimiter } from 'node:path';
import { AppError } from '../core/model.js';

export interface GithubBrowser {
  available(): boolean;
  login(signal: AbortSignal, onCode: (code: string) => void): Promise<string>;
}
export class GhBrowser implements GithubBrowser {
  constructor(private readonly executable = findGh()) {}
  available() { return this.executable !== undefined; }
  async login(signal: AbortSignal, onCode: (code: string) => void): Promise<string> {
    if (!this.executable) throw new AppError('GITHUB_CLI_MISSING');
    const executable = this.executable;
    const directory = await mkdtemp(join(tmpdir(), 'release-calendar-gh-'));
    const env: NodeJS.ProcessEnv = {};
    for (const key of ['HOME', 'PATH', 'TMPDIR', 'SystemRoot', 'HTTPS_PROXY', 'HTTP_PROXY', 'NO_PROXY', 'SSL_CERT_FILE']) {
      if (process.env[key]) env[key] = process.env[key];
    }
    Object.assign(env, { GH_CONFIG_DIR: directory, GH_BROWSER: process.platform === 'win32' ? 'cmd /c exit' : '/usr/bin/true', GH_PROMPT_DISABLED: '1', GH_NO_UPDATE_NOTIFIER: '1', NO_COLOR: '1' });
    // The temporary CLI store avoids both the user's gh configuration and its shared keychain entries.
    const child = spawn(executable, ['auth', 'login', '--hostname', 'github.com', '--web', '--git-protocol', 'https', '--skip-ssh-key', '--insecure-storage'], { env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    let output = '', sent = false;
    const capture = (chunk: Buffer) => {
      output = (output + chunk.toString('utf8')).slice(-8192);
      const code = output.match(/\b[A-Z0-9]{4}-[A-Z0-9]{4}\b/)?.[0];
      if (code && !sent && !signal.aborted) { sent = true; onCode(code); }
    };
    child.stdout.on('data', capture); child.stderr.on('data', capture);
    const exited = new Promise<number | null>((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    const stop = () => { child.kill('SIGTERM'); killTimer = setTimeout(() => child.kill('SIGKILL'), 2000); killTimer.unref(); };
    signal.addEventListener('abort', stop, { once: true });
    child.stdin.on('error', () => { /* Process exit is handled by the close/error promise. */ });
    child.stdin.end('\n');
    try {
      if (signal.aborted) stop();
      const code = await exited;
      if (signal.aborted) throw new AppError('OAUTH_CANCELLED');
      if (code !== 0) throw new AppError('GITHUB_LOGIN_FAILED');
      const token = await new Promise<string>((resolve, reject) => {
        execFile(executable, ['auth', 'token', '--hostname', 'github.com'], { env, timeout: 15000, maxBuffer: 16384, signal }, (error, stdout) => error ? reject(new AppError('GITHUB_LOGIN_FAILED')) : resolve(stdout.trim()));
      });
      if (!token || signal.aborted) throw new AppError('OAUTH_CANCELLED');
      return token;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(signal.aborted ? 'OAUTH_CANCELLED' : 'GITHUB_LOGIN_FAILED');
    } finally {
      signal.removeEventListener('abort', stop);
      if (killTimer) clearTimeout(killTimer);
      output = '';
      await rm(directory, { recursive: true, force: true });
    }
  }
}
function findGh(): string | undefined {
  const candidates = [process.env['RELEASE_CALENDAR_GH'], ...((process.env['PATH'] ?? '').split(delimiter).filter(Boolean).map(p => join(p, process.platform === 'win32' ? 'gh.exe' : 'gh'))), '/opt/homebrew/bin/gh', '/usr/local/bin/gh', '/usr/bin/gh'];
  for (const path of candidates) {
    if (!path) continue;
    try { accessSync(path, constants.X_OK); return path; } catch { /* Try the next installed CLI location. */ }
  }
  return undefined;
}
