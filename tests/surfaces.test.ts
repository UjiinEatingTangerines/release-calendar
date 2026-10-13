import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { z } from 'zod';
import { Runtime } from '../src/runtime.js';
import { createApp } from '../src/server.js';

describe('Real CLI and common HTTP surface', () => {
  it('returns identical calendar data to UI API and CLI for the same project and date', async () => {
    // Given a fixed fictional data anchor.
    const runtime = await Runtime.create({ demo:true,demoAt:'2027-03-10' });
    const app = createApp(runtime);
    // When querying both public read surfaces.
    const response = await app.request('http://127.0.0.1/api/calendar?project=demo&month=2027-03');
    const cli = execFileSync(process.execPath,['dist/cli.js','calendar','--demo','--project','demo','--month','2027-03','--demo-at','2027-03-10','--json'],{ encoding:'utf8' });
    // Then the complete API contract matches and the externally expected QA date is present.
    const http: unknown = await response.json(); expect(JSON.parse(cli)).toEqual(http);
    const parsed = z.object({ events:z.array(z.object({ kind:z.string(),start:z.string(),title:z.string() })) }).parse(http);
    expect(parsed.events.find((e) => e.kind === 'qa' && e.title === 'Web 1.8')?.start).toBe('2027-03-10');
  });
  it('blocks remote origins, rebinding hosts, and external mutation routes', async () => {
    const app = createApp(await Runtime.create({ demo:true }));
    expect((await app.request('http://evil.example/api/projects')).status).toBe(403);
    expect((await app.request('http://localhost/api/projects',{ headers:{ Origin:'https://evil.example' } })).status).toBe(403);
    expect((await app.request('http://localhost/api/refresh?project=demo',{ method:'POST' })).status).toBe(403);
    expect((await app.request('http://localhost/api/release',{ method:'DELETE' })).status).toBe(405);
  });
  it('serves local-only refresh with no provider credentials in responses', async () => {
    const app = createApp(await Runtime.create({ demo:true }));
    const response = await app.request('http://localhost/api/refresh?project=demo',{ method:'POST',headers:{ 'X-Release-Calendar':'local',Origin:'http://localhost' } });
    expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('no-store');
    const text = await response.text(); expect(text).not.toMatch(/Authorization|tokenEnv|JIRA_TOKEN|GITHUB_TOKEN/);
  });
  it('returns a failing exit status for an unknown release', () => {
    expect(() => execFileSync(process.execPath,['dist/cli.js','release','unknown','--json'],{ stdio:'pipe' })).toThrow();
  });
});
