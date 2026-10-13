import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { once } from 'node:events';
import { demoProject } from '../dist/demo.js';
const directory = await mkdtemp(join(tmpdir(), 'release-gh-shutdown-'));
const before = new Set((await readdir(tmpdir())).filter(p => p.startsWith('release-calendar-gh-')));
let child, exited, loginPid;
try {
  const config = join(directory, 'config.json');
  await writeFile(config, JSON.stringify({ projects: [demoProject] }), { mode: 0o600 });
  child = spawn(process.execPath, [resolve('desktop-build/Release Calendar.app/Contents/Resources/server/desktop.mjs')], {
    env: { ...process.env, RELEASE_CALENDAR_CONFIG: config, RELEASE_CALENDAR_DATA_DIR: join(directory, 'data') }, stdio: ['pipe', 'pipe', 'ignore'],
  });
  exited = once(child, 'exit');
  let buffer = '';
  const url = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Server startup timeout')), 10000);
    child.stdout.on('data', chunk => { buffer += chunk.toString(); if (buffer.includes('\n')) { clearTimeout(timer); resolve(JSON.parse(buffer.split('\n')[0]).url); } });
    child.once('error', reject);
  });
  const view = await (await fetch(`${url}/api/settings`)).json();
  const response = await fetch(`${url}/api/settings/oauth/start`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Release-Settings': view.csrf }, body: JSON.stringify({ provider: 'github' }), signal: AbortSignal.timeout(35000) });
  assert.equal(response.status, 200);
  const login = await response.json(); assert.ok(login.userCode); assert.equal(login.url, 'https://github.com/login/device');
  loginPid = Number(execFileSync('pgrep', ['-P', String(child.pid), '-x', 'gh'], { encoding: 'utf8' }).trim()); assert.ok(loginPid);
  child.stdin.end();
  await Promise.race([exited, new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('Shutdown timeout')), 6000); timer.unref(); })]);
  assert.throws(() => process.kill(loginPid, 0), { code: 'ESRCH' });
  assert.deepEqual((await readdir(tmpdir())).filter(p => p.startsWith('release-calendar-gh-') && !before.has(p)), []);
  console.log(JSON.stringify({ verdict: 'PASS', liveDeviceCodeIssued: true, ownedGhExited: true, temporaryCredentialsRemoved: true, userConsent: 'not performed' }));
} finally {
  if (child && child.exitCode === null) { child.kill('SIGKILL'); await exited; }
  if (loginPid) { try { process.kill(loginPid, 'SIGKILL'); } catch {} }
  await rm(directory, { recursive: true, force: true });
}
