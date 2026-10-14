import type { Project } from '../config.js';
import { addDays, monthDays, offsetDate, weekday, type LocalDate } from './dates.js';
import { AppError, type Release, type Snapshot } from './model.js';

export type EventKind = 'planning' | 'development' | 'freeze' | 'qa' | 'release' | 'ticket';
export type CalendarEvent = {
  readonly id: string; readonly releaseId: string; readonly title: string; readonly kind: EventKind;
  readonly start: LocalDate; readonly end: LocalDate; readonly source: 'jira' | 'rule';
  readonly sourceDetail: string; readonly url: string;
};
export function milestones(release: Release, project: Project) {
  const date = release.releaseDate;
  const freeze = date && project.rules.featureFreeze ? offsetDate(date, project.rules.featureFreeze) : null;
  const qa = date && project.rules.qa ? offsetDate(date, project.rules.qa) : null;
  const rule = project.rules.planning;
  let planningStart = rule ? release.startDate : null;
  if (planningStart && rule?.basis === 'weekdays') {
    while (weekday(planningStart) >= 5) planningStart = addDays(planningStart, 1);
  }
  const planningEnd = planningStart && rule ? offsetDate(planningStart, { ...rule, days: rule.days - 1 }) : null;
  const developmentStart = planningEnd && rule ? offsetDate(planningEnd, { ...rule, days: 1 }) : release.startDate;
  const developmentEnd = freeze ?? (qa ? addDays(qa, -1) : date);
  return { freeze, qa, planningStart, planningEnd, developmentStart, developmentEnd,
    valid: !(freeze && qa && freeze > qa) && !(planningEnd && developmentEnd && planningEnd >= developmentEnd) };

}
export function schedule(snapshot: Snapshot, project: Project): readonly CalendarEvent[] {
  const events: CalendarEvent[] = [];
  for (const release of snapshot.releases) {
    const { freeze, qa, planningStart, planningEnd, developmentStart, developmentEnd, valid } = milestones(release, project);
    const base = { releaseId: release.id, title: release.name, url: release.url };
    if (valid && planningStart && planningEnd)
      events.push({ ...base, id: `${release.id}:planning`, kind: 'planning', start: planningStart, end: planningEnd, source: 'rule', sourceDetail: `Jira version.startDate + planning rule ${JSON.stringify(project.rules.planning)}; holidays not applied` });
    if (valid && developmentStart && developmentEnd && developmentStart <= developmentEnd)
      events.push({ ...base, id: `${release.id}:development`, kind: 'development', start: developmentStart, end: developmentEnd, source: project.rules.planning || freeze || qa ? 'rule' : 'jira', sourceDetail: 'Release start after configured planning period → feature freeze (inclusive), otherwise before QA or release date; not ticket duration' });
    if (release.releaseDate)
      events.push({ ...base, id: `${release.id}:release`, kind: 'release', start: release.releaseDate, end: release.releaseDate, source: 'jira', sourceDetail: 'Jira version.releaseDate; deployment success unknown' });
    if (valid) {
      if (freeze) events.push({ ...base, id: `${release.id}:freeze`, kind: 'freeze', start: freeze, end: freeze, source: 'rule', sourceDetail: JSON.stringify(project.rules.featureFreeze) });
      if (qa && release.releaseDate) events.push({ ...base, id: `${release.id}:qa`, kind: 'qa', start: qa, end: release.releaseDate > qa ? addDays(release.releaseDate, -1) : qa, source: 'rule', sourceDetail: JSON.stringify(project.rules.qa) });
    }
  }
  for (const ticket of snapshot.tickets) {
    const start = ticket.startDate ?? ticket.dueDate;
    const end = ticket.dueDate ?? ticket.startDate;
    if (!start || !end || start > end) continue;
    for (const releaseId of ticket.releaseIds) if (snapshot.releases.some((r) => r.id === releaseId))
      events.push({ id: `${ticket.id}:${releaseId}`, releaseId, title: `${ticket.key} ${ticket.title}`, kind: 'ticket', start, end, source: 'jira', sourceDetail: ticket.dateSources.join(', '), url: ticket.url });
  }
  return events.sort((a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id));
}
export function calendar(snapshot: Snapshot, project: Project, month: string) {
  const days = monthDays(month);
  const start = days.at(0), end = days.at(-1);
  if (!start || !end) throw new AppError('MONTH_INVALID');
  const events = schedule(snapshot, project).filter((e) => e.start <= end && e.end >= start);
  return { month, days, events, undated: snapshot.releases.filter((r) => !r.releaseDate), releases: snapshot.releases };
}
export function weekSegments(events: readonly CalendarEvent[], days: readonly LocalDate[]) {
  const first = days.at(0), last = days.at(-1);
  if (!first || !last) return [];
  const occupied: number[] = [];
  return events.filter((e) => e.start <= last && e.end >= first).map((event) => {
    const start = days.findIndex((day) => day >= event.start);
    const end = days.filter((day) => day <= event.end).length;
    let lane = occupied.findIndex((column) => column <= start);
    if (lane < 0) lane = occupied.length;
    occupied[lane] = end;
    return { event, start, span: end - start, lane, continuesBefore: event.start < first, continuesAfter: event.end > last };
  });
}
