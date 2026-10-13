import { it, expect } from 'vitest';
import { mkdtemp, writeFile, rm, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { GhBrowser, type GithubBrowser } from '../src/auth/github-browser.js';
import { OAuth } from '../src/auth/service.js';
import { OAuthTransport } from '../src/auth/transport.js';

it('runs the official CLI arguments in isolated storage and cleans credentials after success', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'release-gh-test-'));
  try {
    const executable = join(dir, 'gh');
    const trace = join(dir, 'trace.json');
    await writeFile(executable, `#!${process.execPath}
const fs=require('node:fs');
const args=process.argv.slice(2);
if(args[1]==='login') {
 fs.writeFileSync(${JSON.stringify(trace)},JSON.stringify({args, directory:process.env.GH_CONFIG_DIR, browser:process.env.GH_BROWSER, inheritedToken:!!process.env.GH_TOKEN}));
 fs.writeFileSync(process.env.GH_CONFIG_DIR+'/hosts.yml','fictional-local-token',{mode:0o600});
 process.stderr.write('First copy your one-time code: ABCD-EFGH\\n');
} else if(args[1]==='token') process.stdout.write('fictional-token');
`, { mode: 0o700 });
    const codes: string[] = [];
    const token = await new GhBrowser(executable).login(new AbortController().signal, c => codes.push(c));
    expect(token).toBe('fictional-token'); expect(codes).toEqual(['ABCD-EFGH']);
    const recorded = JSON.parse(await readFile(trace, 'utf8')) as { args: string[]; directory: string; browser: string; inheritedToken: boolean };
    expect(recorded.args).toEqual(['auth', 'login', '--hostname', 'github.com', '--web', '--git-protocol', 'https', '--skip-ssh-key', '--insecure-storage']);
    expect(recorded.browser).toBe('/usr/bin/true'); expect(recorded.inheritedToken).toBe(false);
    await expect(stat(recorded.directory)).rejects.toMatchObject({ code: 'ENOENT' });
  } finally { await rm(dir, { recursive: true, force: true }); }
});
it('cancels an owned CLI process and removes its temporary credential directory', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'release-gh-cancel-'));
  try {
    const executable = join(dir, 'gh'), trace = join(dir, 'directory');
    await writeFile(executable, `#!${process.execPath}
require('node:fs').writeFileSync(${JSON.stringify(trace)},process.env.GH_CONFIG_DIR);
process.stderr.write('ABCD-EFGH\\n');setInterval(()=>{},1000);
`, { mode: 0o700 });
    const controller = new AbortController();
    await expect(new GhBrowser(executable).login(controller.signal, () => controller.abort())).rejects.toMatchObject({ code: 'OAUTH_CANCELLED' });
    await expect(stat(await readFile(trace, 'utf8'))).rejects.toMatchObject({ code: 'ENOENT' });
  } finally { await rm(dir, { recursive: true, force: true }); }
});
it('reports an unavailable executable without leaking process errors', async () => {
  await expect(new GhBrowser('/nonexistent/fictional-gh').login(new AbortController().signal, () => {})).rejects.toMatchObject({ code: 'GITHUB_LOGIN_FAILED' });
});
it('persists a browser-authenticated grant and lists repositories across pages using only GET', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'release-gh-oauth-'));
  let complete: ((token: string) => void) | undefined;
  const browser: GithubBrowser = { available: () => true, login: async (_signal, code) => { code('ABCD-EFGH'); return new Promise<string>(resolve => { complete = resolve; }); } };
  const calls: Request[] = [];
  const transport = new OAuthTransport(async (input, init) => {
    const request = new Request(input, init); calls.push(request);
    const page = new URL(request.url).searchParams.get('page');
    return Response.json(page === '1' ? Array.from({ length: 100 }, (_, i) => ({ id: i + 1, full_name: `fictional/repo-${i}` })) : [{ id: 101, full_name: 'fictional/last' }]);
  });
  const oauth = new OAuth(join(dir, 'auth.json'), transport, 4318, browser);
  try {
    const attempt = await oauth.start('github');
    expect(attempt).toMatchObject({ url: 'https://github.com/login/device', userCode: 'ABCD-EFGH' });
    expect(oauth.status(attempt.id).status).toBe('pending');
    complete?.('fictional-token');
    await expect.poll(() => oauth.status(attempt.id).status).toBe('complete');
    const grant = oauth.status(attempt.id).grantId!;
    expect((await oauth.repositories(grant))).toHaveLength(101);
    expect(calls.every(r => r.method === 'GET' && new URL(r.url).pathname === '/user/repos')).toBe(true);
    expect(JSON.stringify(await oauth.view())).not.toContain('fictional-token');
    expect(await new OAuth(join(dir, 'auth.json')).access(grant, 'github')).toBe('fictional-token');
    await oauth.forget(grant);
    await expect(oauth.access(grant, 'github')).rejects.toMatchObject({ code: 'OAUTH_REAUTHORIZE' });
  } finally { oauth.close(); await rm(dir, { recursive: true, force: true }); }
});
it('does not persist a late token after cancellation', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'release-gh-late-'));
  let complete: ((token: string) => void) | undefined;
  const browser: GithubBrowser = { available: () => true, login: async (_signal, code) => { code('ABCD-EFGH'); return new Promise<string>(resolve => { complete = resolve; }); } };
  const oauth = new OAuth(join(dir, 'auth.json'), undefined, 4318, browser);
  try {
    const attempt = await oauth.start('github'); oauth.cancel(attempt.id); complete?.('fictional-token');
    await new Promise(resolve => setImmediate(resolve));
    expect(oauth.status(attempt.id)).toMatchObject({ status: 'error', code: 'OAUTH_CANCELLED' });
    expect((await oauth.store.read()).grants).toEqual([]);
  } finally { oauth.close(); await rm(dir, { recursive: true, force: true }); }
});
