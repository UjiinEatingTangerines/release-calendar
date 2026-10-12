import { describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { demoProject } from '../src/demo.js';

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'release-calendar-desktop-'));
  const config = join(dir, 'config.json');
  await writeFile(config, JSON.stringify({ projects: [demoProject] }), { mode: 0o600 });
  return { dir, config };
}
function launch(config: string) {
  return spawn(process.execPath, ['dist/desktop.js'], { stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, RELEASE_CALENDAR_CONFIG: config, JIRA_EMAIL: '', JIRA_TOKEN: '', GITHUB_TOKEN: '' } });
}
async function ready(child: ReturnType<typeof launch>) {
  const lines = createInterface({ input: child.stdout });
  try {
    for await (const line of lines) return z.object({ url: z.url() }).parse(JSON.parse(line)).url;
    throw new Error('Desktop backend exited before readiness');
  } finally { lines.close(); }
}
async function stop(child: ReturnType<typeof launch>) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exit = once(child, 'exit'); child.kill('SIGTERM'); await exit;
}

describe('Real desktop backend lifecycle', () => {
  it('accepts owner-only configured credentials without returning them to the browser', async () => {
    // Given a private file with a configured key and no request to sync providers.
    const f = await fixture(); const marker = 'fictional-private-value';
    await writeFile(join(f.dir, 'credentials.json'), JSON.stringify({ JIRA_TOKEN: marker }), { mode: 0o600 });
    const child = launch(f.config);
    try {
      // When launching and reading the public project contract.
      const address = await ready(child); const response = await fetch(`${address}/api/projects`);
      const body = await response.text();
      // Then live mode works and secret values and env names stay private.
      expect(response.status).toBe(200); expect(JSON.parse(body)).toMatchObject({ mode: 'live' });
      expect(body).not.toContain(marker); expect(body).not.toContain('JIRA_TOKEN');
    } finally { await stop(child); await rm(f.dir, { recursive: true, force: true }); }
  });
  it('fails invalid live configuration instead of falling back to demo', async () => {
    // Given an explicit invalid local connection file.
    const f = await fixture(); await writeFile(f.config, '{');
    const child = launch(f.config); let output = ''; child.stdout.on('data', (data: Buffer) => { output += data.toString(); });
    try {
      // When the desktop backend starts; Then it publishes no URL and fails.
      const [code] = await once(child, 'exit'); expect(code).toBe(1); expect(output).toBe('');
    } finally { await stop(child); await rm(f.dir, { recursive: true, force: true }); }
  });
  it('uses distinct ephemeral ports and shuts down only its own server on pipe EOF', async () => {
    // Given two independent owners (no fixed port or user configuration).
    const f = await fixture(); const first = launch(f.config), second = launch(f.config);
    try {
      const [a, b] = await Promise.all([ready(first), ready(second)]);
      expect(a).not.toBe(b);
      // When one app closes its ownership pipe.
      const exited = once(first, 'exit'); first.stdin.end(); await exited;
      // Then that endpoint stops while the other server and bundled web still work.
      await expect(fetch(a)).rejects.toThrow();
      expect((await fetch(b)).status).toBe(200);
      expect(await (await fetch(`${b}/api/projects`)).json()).toMatchObject({ mode: 'live' });
    } finally { await Promise.all([stop(first), stop(second)]); await rm(f.dir, { recursive: true, force: true }); }
  });
  it('refuses a world-readable credential file without leaking its contents', async () => {
    // Given a plaintext credential file accessible to other users.
    const f = await fixture(); const marker = 'fictional-sensitive-test-value';
    await writeFile(join(f.dir, 'credentials.json'), JSON.stringify({ JIRA_TOKEN: marker }), { mode: 0o644 });
    const child = launch(f.config); let errors = ''; child.stderr.on('data', (data: Buffer) => { errors += data.toString(); });
    try {
      // When launching the real desktop backend.
      const [code] = await once(child, 'exit');
      // Then it fails before listening with a redacted permission error.
      expect(code).toBe(1); expect(errors).toContain('CREDENTIAL_FILE_REQUIRES_OWNER_ONLY_PERMISSIONS'); expect(errors).not.toContain(marker);
    } finally { await stop(child); await rm(f.dir, { recursive: true, force: true }); }
  });
  it('rejects unconfigured credential names rather than mutating arbitrary environment', async () => {
    // Given a private file containing a noncredential process option.
    const f = await fixture(); await writeFile(join(f.dir, 'credentials.json'), JSON.stringify({ NODE_OPTIONS: '--inspect' }), { mode: 0o600 });
    const child = launch(f.config); let errors = ''; child.stderr.on('data', (data: Buffer) => { errors += data.toString(); });
    try {
      // When the actual backend parses the file; Then no server starts.
      const [code] = await once(child, 'exit'); expect(code).toBe(1); expect(errors).toContain('CREDENTIAL_NAME_NOT_CONFIGURED');
    } finally { await stop(child); await rm(f.dir, { recursive: true, force: true }); }
  });
});
