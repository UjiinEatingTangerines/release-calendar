import { describe, expect, it } from 'vitest';
import { addDays, dateInZone, dateSchema, monthDays, offsetDate } from '../src/core/dates.js';
import { calendar, schedule, weekSegments } from '../src/core/schedule.js';
import { demoProject, demoState } from '../src/demo.js';

describe('Gregorian calendar', () => {
  it.each([
    ['2027-02', 28, '2027-02-01', '2027-02-28', 28],
    ['2028-02', 29, '2028-01-31', '2028-03-05', 35],
    ['2027-04', 30, '2027-03-29', '2027-05-02', 35],
    ['2027-05', 31, '2027-04-26', '2027-06-06', 42],
    ['2026-12', 31, '2026-11-30', '2027-01-03', 35],
  ])('renders %s with independently known boundaries', (month,count,start,end,cells) => {
    // Given a Gregorian month; When building its Monday-first calendar.
    const days = monthDays(month);
    // Then the month and boundary cells match the civil calendar.
    expect(days.filter((date) => date.startsWith(month))).toHaveLength(count);
    expect([days[0], days.at(-1), days.length]).toEqual([start,end,cells]);
  });
  it('preserves date-only values across host zones', () => {
    // Given a leap-day date-only value; When adding one calendar day.
    const result = addDays(dateSchema.parse('2028-02-29'),1);
    // Then no local timezone conversion occurs.
    expect(result).toBe('2028-03-01');
  });
  it('uses project timezones for timestamp dates', () => {
    // Given one instant on opposite sides of local midnight.
    const instant = new Date('2027-03-10T00:30:00Z');
    // When converting to project-local dates; Then dates differ as expected.
    expect([dateInZone(instant,'Asia/Seoul'), dateInZone(instant,'America/Los_Angeles')]).toEqual(['2027-03-10','2027-03-09']);
  });
  it('skips weekends but does not assume holidays', () => {
    // Given a Monday; When subtracting three weekdays.
    const value = offsetDate(dateSchema.parse('2027-03-15'),{ days:-3,basis:'weekdays' });
    // Then Wednesday is the result, regardless of holidays.
    expect(value).toBe('2027-03-10');
  });
  it('rejects impossible civil dates', () => {
    expect(() => dateSchema.parse('2027-02-29')).toThrow();
  });
});
describe('Release scheduling', () => {
  const snapshot = demoState(new Date('2027-03-10T03:00:00Z')).current;
  if (!snapshot) throw new Error('Fixture snapshot missing');
  it('keeps undated tickets out of the calendar', () => {
    // Given a release containing an undated ticket; When computing events.
    const events = schedule(snapshot,demoProject);
    // Then only explicitly dated tickets create events.
    expect(events.filter((e) => e.kind === 'ticket').map((e) => e.title.split(' ')[0])).toEqual(['DEMO-101','DEMO-103']);
  });
  it('continues a period through a week and month boundary', () => {
    // Given a release from February 25 through March 14; When viewing the first March week.
    const events = schedule(snapshot,demoProject).filter((e) => e.kind === 'development');
    const segments = weekSegments(events,monthDays('2027-03').slice(0,7));
    // Then Web occupies the whole week, with both continuation ends.
    expect(segments[0]).toMatchObject({ start:0,span:7,lane:0,continuesBefore:true,continuesAfter:true });
    expect(segments[1]).toMatchObject({ start:6,span:1,lane:1,continuesAfter:true });
  });
  it('retains undated releases separately', () => {
    // Given a release with no dates; When building a calendar.
    const result = calendar(snapshot,demoProject,'2027-03');
    // Then the SDK remains discoverable outside dated events.
    expect(result.undated.map((r) => r.versionId)).toEqual(['4']);
  });
});
