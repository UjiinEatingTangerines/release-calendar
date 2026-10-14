import { expect, it } from 'vitest';
import { demoProject, demoState } from '../src/demo.js';
import { projectSchema } from '../src/config.js';
import { dateSchema } from '../src/core/dates.js';
import { schedule } from '../src/core/schedule.js';
import { Queries } from '../src/core/query.js';

const project = projectSchema.parse({ ...demoProject, rules: { planning: { days: 3, basis: 'weekdays' }, featureFreeze: { days: -4, basis: 'weekdays' }, qa: { days: -3, basis: 'weekdays' } } });
const now = new Date('2027-03-03T03:00:00Z');
const original = demoState(now);
if (!original.current?.releases[0]) throw new Error('Fixture missing');
const release = { ...original.current.releases[0], startDate: dateSchema.parse('2027-03-01'), releaseDate: dateSchema.parse('2027-03-16') };
const state = { ...original, current: { ...original.current, releases: [release], tickets: [] } };
it('separates three planning weekdays from five development weekdays and QA', () => {
  expect(schedule(state.current, project).map(e => [e.kind, e.start, e.end])).toEqual([
    ['planning', '2027-03-01', '2027-03-03'],
    ['development', '2027-03-04', '2027-03-10'],
    ['freeze', '2027-03-10', '2027-03-10'],
    ['qa', '2027-03-11', '2027-03-15'],
    ['release', '2027-03-16', '2027-03-16'],
  ]);
  const queries = new Queries(project, state, now);
  expect(queries.guide(dateSchema.parse('2027-03-03')).releases[0]).toMatchObject({ phase: 'planning', nextDeadline: { kind: 'planning', deadlineDate: '2027-03-03' } });
  expect(queries.guide(dateSchema.parse('2027-03-04')).releases[0]?.phase).toBe('development');
});
it('counts a Friday start across the weekend and normalizes a weekend start', () => {
  for (const [start, end] of [['2027-02-26', '2027-03-02'], ['2027-02-27', '2027-03-03']]) {
    const snapshot = { ...state.current, releases: [{ ...release, startDate: dateSchema.parse(start) }] };
    expect(schedule(snapshot, project).find(e => e.kind === 'planning')?.end).toBe(end);
  }
});
it('does not invent planning without a start date or configured rule', () => {
  expect(schedule(state.current, demoProject).some(e => e.kind === 'planning')).toBe(false);
  expect(schedule({ ...state.current, releases: [{ ...release, startDate: null }] }, project).some(e => e.kind === 'planning')).toBe(false);
});
it('does not show contradictory planning when planning exceeds the available development window', () => {
  const short = { ...state.current, releases: [{ ...release, startDate: dateSchema.parse('2027-03-10') }] };
  expect(schedule(short, project).some(e => e.kind === 'planning' || e.kind === 'development')).toBe(false);
  expect(new Queries(project, { ...state, current: short }, now).guide(dateSchema.parse('2027-03-10')).releases[0]?.phase).toBe('unknown');
});
