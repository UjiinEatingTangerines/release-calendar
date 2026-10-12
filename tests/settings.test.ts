import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, stat, copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Runtime } from '../src/runtime.js';
import { demoProject } from '../src/demo.js';
import { connectionInputSchema, editableProjectSchema, settingsViewSchema } from '../src/core/connection-model.js';
import { createApp } from '../src/server.js';
import { AppError } from '../src/core/model.js';
import { probeReaders } from '../src/settings/probe.js';
import type { Reader } from '../src/connectors/http.js';
import type { z } from 'zod';

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'release-settings-')), path = join(dir, 'connections.json');
  const runtime = await Runtime.create({ demo: true, settingsPath: path, dataDir: join(dir, 'data') });
  const input = connectionInputSchema.parse({ revision: 'initial', project: editableProjectSchema.parse(demoProject), credentials: { jiraEmail: 'fictional@example.com', jiraToken: 'fictional-jira-marker', githubToken: 'fictional-github-marker' } });
  return { runtime, path, input, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

describe('Local settings contract', () => {
  it('persists private settings atomically and shares them with another runtime without returning secrets', async () => {
    // Given a demo server and a second consumer of its local settings file.
    const f = await fixture();
    try {
      // When the first server saves a new connection.
      await f.runtime.connections.save(f.input);
      const second = await Runtime.create({ settingsPath: f.path });
      const view = await second.connections.view();
      // Then the shared mode/config changes, disk is private, and GET metadata has only credential presence.
      expect(second.demo).toBe(false); expect(second.project('demo').jira.site).toBe(demoProject.jira.site);
      expect((await stat(f.path)).mode & 0o777).toBe(0o600);
      expect(view.projects[0]?.saved).toEqual({ jiraEmail: true, jiraToken: true, githubToken: true });
      expect(JSON.stringify(view)).not.toMatch(/fictional-jira-marker|fictional-github-marker|fictional@example.com|emailEnv|tokenEnv/);
    } finally { await f.cleanup(); }
  });
  it('uses a settings-saved connection in the compiled CLI without environment credentials', async () => {
    const f = await fixture();
    try {
      // Given UI-managed settings at a custom configuration sidecar.
      await f.runtime.connections.save(f.input);
      const config = `${f.path}.config`;
      await copyFile(f.path, `${config}.connections.json`);
      // When a separate CLI process queries the saved connection without syncing.
      const { stdout } = await promisify(execFile)(process.execPath, ['dist/cli.js', 'status', '--config', config, '--data-dir', `${f.path}.data`, '--project', 'demo', '--json']);
      // Then the live project is selected, with no invented source snapshot or secret echo.
      const result = JSON.parse(stdout);
      expect(result.project).toBe('demo'); expect(result.dataAsOf).toBeNull();
      expect(stdout).not.toContain('fictional-jira-marker');
    } finally { await f.cleanup(); }
  });
  it('keeps blank secrets during edits and rejects stale concurrent changes', async () => {
    // Given a saved connection and two editors at the same revision.
    const f = await fixture();
    try {
      await f.runtime.connections.save(f.input); const current = await f.runtime.connections.view();
      const edit = { ...f.input, revision: current.revision, originalId: 'demo', credentials: {}, project: { ...f.input.project, name: 'Edited fictional project' } };
      // When the first edit saves and the older revision tries to overwrite it.
      await f.runtime.connections.save(edit);
      await expect(f.runtime.connections.save({ ...edit, project: { ...edit.project, name: 'Stale overwrite' } })).rejects.toMatchObject({ code: 'SETTINGS_CHANGED_RELOAD' });
      // Then the first result and its original credentials survive.
      expect(f.runtime.project('demo').name).toBe('Edited fictional project');
      expect(f.runtime.connections.resolveSecret(f.runtime.project('demo').jira.tokenEnv)).toBe('fictional-jira-marker');
    } finally { await f.cleanup(); }
  });
  it('requires fresh Jira credentials before redirecting a saved connection to another site', async () => {
    const f = await fixture();
    try {
      // Given credentials scoped to the saved site.
      await f.runtime.connections.save(f.input); const current = await f.runtime.connections.view();
      // When an edit changes the site while leaving credentials blank.
      await expect(f.runtime.connections.check({ ...f.input, revision: current.revision, originalId: 'demo', credentials: {}, project: { ...f.input.project, jira: { ...f.input.project.jira, site: 'https://other-fictional.atlassian.net' } } })).rejects.toMatchObject({ code: 'NEW_JIRA_CREDENTIALS_REQUIRED' });
      // Then existing settings were not replaced.
      expect(f.runtime.project('demo').jira.site).toBe(demoProject.jira.site);
    } finally { await f.cleanup(); }
  });
  it('removes local credentials and switches to demo without touching provider records', async () => {
    const f = await fixture();
    try {
      // Given a locally saved connection.
      await f.runtime.connections.save(f.input); const view = await f.runtime.connections.view();
      // When disconnecting through the local store.
      await f.runtime.connections.remove('demo', view.revision);
      // Then persistence is empty and another runtime sees demo, with no remaining secret marker.
      expect((await Runtime.create({ settingsPath: f.path })).demo).toBe(true);
      expect(await readFile(f.path, 'utf8')).not.toContain('fictional-jira-marker');
      expect((await f.runtime.connections.view()).projects).toEqual([]);
    } finally { await f.cleanup(); }
  });
  it('protects writes with same-origin and server tokens and redacts saved responses', async () => {
    const f = await fixture();
    try {
      // Given a local settings route with a fresh server token.
      const app = createApp(f.runtime); const view = settingsViewSchema.parse(await (await app.request('http://localhost/api/settings')).json());
      const request = { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Release-Settings': view.csrf }, body: JSON.stringify(f.input) };
      // When callers use an invalid origin or no token, then attempt an authorized local save.
      expect((await app.request('http://localhost/api/settings/save', { ...request, headers: { ...request.headers, Origin: 'https://evil.example' } })).status).toBe(403);
      expect((await app.request('http://localhost/api/settings/save', { ...request, headers: { 'Content-Type': 'application/json' } })).status).toBe(403);
      const saved = await app.request('http://localhost/api/settings/save', request);
      // Then only the local request succeeds and no submitted secret is echoed.
      expect(saved.status).toBe(200); expect(await saved.text()).not.toContain('fictional-jira-marker');
      expect((await app.request('http://localhost/api/projects')).status).toBe(200);
      expect((await app.request('http://localhost/api/settings/save', { ...request, body: 'x'.repeat(70000) })).status).toBe(413);
    } finally { await f.cleanup(); }
  });
  it('reports connection failures separately and does not save a tested draft', async () => {
    const f = await fixture();
    try {
      // Given a draft and independent provider outcomes.
      const result = await f.runtime.connections.check(f.input, async (_project, secret) => {
        expect(secret(_project.jira.tokenEnv)).toBe('fictional-jira-marker');
        return { jira: { ok: true, code: 'READ_ACCESS_CONFIRMED' }, github: { ok: false, code: 'HTTP_403' } };
      });
      // Then testing alone preserves demo and creates no credential file.
      expect(result.github).toEqual({ ok: false, code: 'HTTP_403' }); expect(f.runtime.demo).toBe(true);
      await expect(stat(f.path)).rejects.toMatchObject({ code: 'ENOENT' });
    } finally { await f.cleanup(); }
  });
  it('probes actual read endpoint contracts and isolates authentication errors', async () => {
    // Given readers exposing only get and recorded provider endpoint paths.
    const paths: string[] = [];
    const jira: Reader = { async get<T>(path: string, schema: z.ZodType<T>) { paths.push(path); return schema.parse(path.includes('/version?') ? { values: [] } : path.includes('/search/') ? { issues: [] } : { id: '100' }); } };
    const github: Reader = { async get() { throw new AppError('HTTP_401'); } };
    // When checking both providers.
    const result = await probeReaders(demoProject, { jira: () => jira, github: () => github });
    // Then versions/issues are checked and GitHub failure does not mask Jira success.
    expect(paths).toHaveLength(3); expect(paths.some((p) => p.includes('/search/jql?'))).toBe(true);
    expect(result).toEqual({ jira: { ok: true, code: 'READ_ACCESS_CONFIRMED' }, github: { ok: false, code: 'HTTP_401' } });
  });
});
