import { describe, expect, it } from 'vitest';
import { Queries } from '../src/core/query.js';
import { demoProject, demoState } from '../src/demo.js';
import { emptyState } from '../src/storage.js';
import { Runtime } from '../src/runtime.js';
import { createApp } from '../src/server.js';

describe('Menu bar shares the public schedule contract', () => {
  it('shows independently known countdowns and phases without released versions', () => {
    // Given March 10 in Seoul and March 14/22 release dates.
    const now = new Date('2027-03-10T03:00:00Z');
    // When querying the same model the native app reads.
    const result = new Queries(demoProject, demoState(now), now).menu();
    // Then archived history is excluded and undated plans have no fabricated countdown.
    expect(result.totalPending).toBe(4);
    expect(result.releases.map((r) => [r.daysUntilRelease, r.phase])).toEqual([[4, 'qa'], [12, 'development'], [26, 'planned'], [null, 'unscheduled']]);
    expect(result.releases[0]?.nextDeadline).toMatchObject({ date: '2027-03-10', source: 'jira', kind: 'ticket' });
  });
  it('keeps overdue unreleased versions visible and reports stale data', () => {
    // Given a March 10 snapshot and a later calendar date.
    const state = demoState(new Date('2027-03-10T03:00:00Z'));
    // When the menu is viewed after a planned release date.
    const result = new Queries(demoProject, state, new Date('2027-03-15T03:00:00Z')).menu();
    // Then elapsed time changes only the phase and countdown.
    expect(result.releases[0]?.name).toBe('API 2.4');
    expect(result.releases.find((r) => r.name === 'Web 1.8')).toMatchObject({ daysUntilRelease: -1, phase: 'past-scheduled-date', observed: { jiraReleased: false, productionDeployment: 'unknown' } });
    expect(result.stale).toBe(true);
  });
  it('computes countdown from the project civil date across a timezone boundary', () => {
    // Given the same instant is March 9 in Los Angeles and March 10 in Seoul.
    const now = new Date('2027-03-10T01:00:00Z');
    // When the project uses Los Angeles.
    const result = new Queries({ ...demoProject, timezone: 'America/Los_Angeles' }, demoState(now), now).menu();
    // Then March 14 is five calendar days away.
    expect(result.today).toBe('2027-03-09'); expect(result.releases[0]?.daysUntilRelease).toBe(5);
  });
  it('reports no successful data separately from no pending plans', () => {
    // Given a never-synced local project; When the menu reads it.
    const result = new Queries(demoProject, emptyState('menu')).menu();
    // Then the empty result includes a missing-data warning.
    expect(result).toMatchObject({ totalPending: 0, releases: [], dataAsOf: null });
    expect(result.warnings).toContain('NO_SUCCESSFUL_SNAPSHOT');
  });
  it('serves the same release phase and timestamp as the guide API', async () => {
    // Given one runtime for both HTTP surfaces.
    const app = createApp(await Runtime.create({ demo: true, demoAt: '2027-03-10' }));
    // When the menu and guide query the same project.
    const menu = await app.request('http://localhost/api/menu?project=demo');
    const guide = await app.request('http://localhost/api/guide?project=demo');
    // Then a known phase and the shared observation timestamp match.
    expect(await menu.json()).toMatchObject({ dataAsOf: '2027-03-10T03:00:00.000Z', releases: [expect.objectContaining({ name: 'Web 1.8', phase: 'qa' }), expect.anything(), expect.anything(), expect.anything()] });
    expect(await guide.json()).toMatchObject({ dataAsOf: '2027-03-10T03:00:00.000Z', releases: [expect.objectContaining({ name: 'Web 1.8', phase: 'qa' }), expect.anything(), expect.anything(), expect.anything()] });
  });
});
