import { describe, expect, it } from 'vitest';
import { Queries } from '../src/core/query.js';
import { dateSchema } from '../src/core/dates.js';
import { demoProject, demoState } from '../src/demo.js';
import { emptyState } from '../src/storage.js';

describe('Shared guide contract', () => {
  const now = new Date('2027-03-10T03:00:00Z');
  const state = demoState(now);
  it('returns separate phases for overlapping releases', () => {
    // Given simultaneous Web and API releases; When evaluating March 10.
    const result = new Queries(demoProject,state,now).guide(dateSchema.parse('2027-03-10'));
    // Then one is in QA while another is still in development.
    expect(result.releases.slice(0,2).map((r) => r.phase)).toEqual(['qa','development']);
    expect(result.dataAsOf).toBe('2027-03-10T03:00:00.000Z');
  });
  it('does not turn elapsed dates into released or deployed observations', () => {
    // Given an unreleased version; When evaluating a later date explicitly for that release.
    const id = state.current?.releases[0]?.id; if (!id) throw new Error('Fixture missing');
    const result = new Queries(demoProject,state,now).guide(dateSchema.parse('2027-04-01'),id);
    // Then only the calendar phase changes.
    expect(result.releases[0]).toMatchObject({ phase:'past-scheduled-date', observed:{ jiraReleased:false, productionDeployment:'unknown' } });
  });
  it('does not pretend a historical --at changes the data snapshot', () => {
    const result = new Queries(demoProject,state,now).guide(dateSchema.parse('2020-01-01'));
    expect(result.dataAsOf).toBe('2027-03-10T03:00:00.000Z');
    expect(result.at).toBe('2020-01-01');
  });
  it('warns about stale snapshots', () => {
    const result = new Queries(demoProject,state,new Date('2027-03-12T03:00:00Z')).status();
    expect(result.stale).toBe(true); expect(result.warnings).toContain('STALE_OR_MISSING_DATA');
  });
  it('reports no history and no future plans when nothing was collected', () => {
    const result = new Queries(demoProject,emptyState('test'),now).calendar('1999-12');
    expect(result).toMatchObject({ dataAsOf:null,firstObservedAt:null,registeredFuturePlans:0,observedSnapshotCount:0 });
    expect(result.events).toEqual([]); expect(result.warnings).toContain('NO_SUCCESSFUL_SNAPSHOT');
  });
  it('filters an explicit release without choosing one global phase', () => {
    const id = state.current?.releases[1]?.id; if (!id) throw new Error('Fixture missing');
    const result = new Queries(demoProject,state,now).guide(dateSchema.parse('2027-03-10'),id);
    expect(result.releases).toHaveLength(1); expect(result.releases[0]?.releaseId).toBe(id);
  });
});
