import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Diagnostics, diagnosticReason, diagnosticScope, bindDiagnostic } from '../src/diagnostics.js';

describe('private diagnostic logs', () => {
  it('classifies refresh failures without retaining raw error content', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'release-log-test-'));
    const log = new Diagnostics(join(directory, 'events.jsonl'));
    try {
      const raw = 'OAuth refresh failed: invalid_grant secret=fictional-secret user=fictional@example.invalid';
      const emit = await diagnosticScope('fictional-project', async () => bindDiagnostic(() => log.record({ event: 'rpc_failed', provider: 'jira', stage: 'mcpServer/tool/call', reason: diagnosticReason(raw) })));
      emit(); await log.flush();
      const text = await readFile(log.path, 'utf8'), event = JSON.parse(text);
      expect(event.reason).toBe('refresh_rejected'); expect(event.traceId).toMatch(/^[0-9a-f-]{36}$/); expect(event.projectRef).toHaveLength(16);
      expect(text).not.toMatch(/fictional|secret|example/);
      expect((await stat(log.path)).mode & 0o777).toBe(0o600);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
  it('keeps three bounded files and strips unknown fields', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'release-log-test-'));
    const log = new Diagnostics(join(directory, 'events.jsonl'), 200);
    try {
      const event = { event: 'sync_start' as const, token: 'fictional-secret' };
      for (let i = 0; i < 15; i++) log.record(event);
      await log.flush();
      for (const suffix of ['', '.1', '.2']) { const text = await readFile(log.path + suffix, 'utf8'); expect(Buffer.byteLength(text)).toBeLessThanOrEqual(200); expect(text).not.toContain('secret'); }
      await expect(stat(log.path + '.3')).rejects.toMatchObject({ code: 'ENOENT' });
      expect(diagnosticReason('OAuth authorization required')).toBe('auth_required');
      expect(diagnosticReason('unexpected private provider message')).toBe('unknown');
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
