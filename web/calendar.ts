import { addDays, type LocalDate } from '../src/core/dates.js';
import { weekSegments, type CalendarEvent } from '../src/core/schedule.js';
import type { CalendarView } from './api.js';
import { button, node, tag } from './dom.js';
import { ko } from './i18n.js';

export type CalendarState = { readonly selectedDate: LocalDate | null; readonly release: string; readonly tickets: boolean; readonly expanded: ReadonlySet<string> };
export type CalendarActions = { readonly selectDate: (date: LocalDate) => void; readonly selectRelease: (id: string) => void; readonly expand: (week: string) => void };
export function renderCalendar(data: CalendarView, state: CalendarState, actions: CalendarActions) {
  const region = node('section', '', 'calendar-region'); region.setAttribute('aria-label', `${data.month} 월간 달력`);
  const events = data.events.filter((event) => (!state.release || event.releaseId === state.release) && (state.tickets || event.kind !== 'ticket'));
  const calendar = node('div', '', 'calendar');
  const headings = node('div', '', 'weekdays'); for (const day of ko.weekdays) headings.append(node('span', day)); calendar.append(headings);
  for (let i = 0; i < data.days.length; i += 7) {
    const days = data.days.slice(i, i + 7), key = days[0]; if (!key) continue;
    const week = node('div', '', 'week');
    const backgrounds = node('div', '', 'week-background'); backgrounds.setAttribute('aria-hidden','true');
    const dates = node('div', '', 'week-dates');
    for (const day of days) {
      backgrounds.append(node('div', '', `${day.startsWith(data.month) ? '' : 'adjacent'} ${day === state.selectedDate ? 'selected' : ''}`));
      const count = events.filter((event) => event.start <= day && event.end >= day).length;
      const control = button('', () => actions.selectDate(day), `day ${day.startsWith(data.month) ? '' : 'adjacent'}`);
      control.id = `day-${day}`;
      control.setAttribute('aria-pressed', String(day === state.selectedDate));
      control.append(node('span', String(Number(day.slice(-2))), day === data.today ? 'today' : ''));
      if (count) control.append(node('span', ` ${count}건`, 'day-count'));
      control.append(node('span', ` · ${day}${day === data.today ? ` ${ko.today}` : ''} · 일정 ${count}건`, 'sr-only'));
      if (day === data.today) control.setAttribute('aria-current', 'date');
      control.addEventListener('keydown', (event) => {
        const offsets: Record<string,number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7, Home: -days.indexOf(day), End: 6-days.indexOf(day) };
        const offset = offsets[event.key]; if (offset === undefined) return;
        event.preventDefault(); actions.selectDate(addDays(day, offset));
      }); dates.append(control);
    }
    week.append(backgrounds, dates);
    const lanes = node('div', '', 'week-events');
    const segments = weekSegments(events, days);
    const expanded = state.expanded.has(key);
    for (const segment of segments.filter((s) => expanded || s.lane < 3)) {
      const event = segment.event;
      const control = button(`${segment.continuesBefore ? '‹ ' : ''}${event.title} · ${ko.kinds[event.kind]}${event.source === 'rule' ? ' (예상)' : ''}${segment.continuesAfter ? ' ›' : ''}`, () => actions.selectRelease(event.releaseId), `event ${event.kind} ${segment.continuesBefore ? 'continues-before' : ''} ${segment.continuesAfter ? 'continues-after' : ''}`);
      control.style.gridColumn = `${segment.start + 1} / span ${segment.span}`; control.style.gridRow = String(segment.lane + 1);
      control.title = `${event.title} · ${ko.kinds[event.kind]} · ${event.start} ~ ${event.end} · ${ko.sources[event.source]}`;
      control.setAttribute('aria-label', `${control.textContent} · ${event.start} ~ ${event.end} · ${ko.sources[event.source]}`); lanes.append(control);
    }
    week.append(lanes);
    const hidden = segments.filter((s) => s.lane >= 3).length;
    if (hidden) { const more = button(expanded ? '접기' : `+ ${hidden}개 더보기`, () => actions.expand(key), 'more'); more.id = `more-${key}`; more.setAttribute('aria-expanded', String(expanded)); week.append(more); }
    calendar.append(week);
  }
  region.append(calendar);
  if (!events.length) region.append(node('p', ko.noMonth, 'empty-notice'));
  const selected = state.selectedDate;
  if (selected) {
    const agenda = node('section', '', 'day-agenda'); agenda.setAttribute('aria-label', '선택일 일정'); agenda.append(node('h3', `${selected} · 선택일 일정`));
    const matches = events.filter((e) => e.start <= selected && e.end >= selected);
    if (!matches.length) agenda.append(node('p', ko.noDay, 'muted'));
    for (const event of matches) {
      const row = button(`${event.title} · ${ko.kinds[event.kind]}`, () => actions.selectRelease(event.releaseId), `agenda-event ${event.kind}`);
      row.append(tag(ko.sources[event.source])); agenda.append(row);
    }
    region.append(agenda);
  }
  return region;
}
