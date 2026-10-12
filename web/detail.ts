import type { DetailView } from './api.js';
import { ko } from './i18n.js';
import { node, pair, tag, link } from './dom.js';
import type { Ticket } from '../src/core/model.js';

function ticketRow(ticket: Ticket) {
  const row = node('li', '', 'ticket-row');
  row.append(link(ticket.key, ticket.url), node('p', ticket.title), node('p', `${ticket.assignee ?? '미지정'} · ${ticket.status}`, 'muted'));
  row.append(node('p', ticket.startDate || ticket.dueDate ? `${ticket.startDate ?? '시작일 없음'} → ${ticket.dueDate ?? '기한 없음'}` : ko.noSchedule, 'small'));
  if (ticket.dateSources.length) row.append(node('p', `Jira · ${ticket.dateSources.join(', ')}`, 'small muted'));
  return row;
}
export function renderDetail(data: DetailView | null) {
  const panel = node('section', '', 'detail-panel'); panel.setAttribute('aria-label', ko.detail);
  panel.append(node('p', 'RELEASE DETAILS', 'eyebrow'));
  if (!data) { panel.append(node('h2', ko.select), node('p', ko.selectHelp, 'muted'), node('div', '01 / 일정 선택   →   02 / 근거 확인', 'empty-hint')); return panel; }
  const release = data.release;
  panel.append(node('h2', release.name), tag(release.released ? ko.status.released : ko.status.unreleased), ...(release.archived ? [tag(ko.status.archived)] : []));
  const facts = node('dl');
  facts.append(pair('개발 기간 · Jira', `${release.startDate ?? '미정'} → ${release.releaseDate ?? '미정'}`), pair('배포일 · Jira', release.releaseDate ?? '미정'), pair('운영 배포 성공', ko.unknown));
  panel.append(facts, link('Jira 릴리스 원문 ↗', release.url));
  const rules = data.events.filter((e) => e.source === 'rule');
  for (const event of rules) panel.append(node('p', `${ko.kinds[event.kind]} · 예상 ${event.start}${event.start !== event.end ? ` ~ ${event.end}` : ''}`, `rule-note ${event.kind}`));
  if (rules.length) panel.append(node('p', '설정한 오프셋으로 계산한 예상 일정입니다. 공휴일은 반영하지 않습니다.', 'small muted'));
  panel.append(node('h3', `포함 티켓 ${data.tickets.length}`));
  const scheduled = data.tickets.filter((t) => t.startDate || t.dueDate);
  if (!data.tickets.length) panel.append(node('p', ko.noTickets, 'muted'));
  const list = node('ul', '', 'ticket-list'); list.append(...scheduled.map(ticketRow)); panel.append(list);
  if (data.unscheduledTickets.length) {
    panel.append(node('h4', `${ko.noSchedule} ${data.unscheduledTickets.length}`));
    const unscheduled = node('ul', '', 'ticket-list'); unscheduled.append(...data.unscheduledTickets.map(ticketRow)); panel.append(unscheduled);
  }
  panel.append(node('h3', `관련 PR ${data.pulls.length}`));
  if (!data.pulls.length) panel.append(node('p', ko.noPulls, 'muted'));
  for (const pr of data.pulls) {
    const article = node('article', '', 'pull');
    article.append(link(`#${pr.number} ${pr.title} ↗`, pr.url), node('p', `${pr.repository} · ${pr.mergedAt ? ko.status.merged : pr.state === 'open' ? ko.status.open : ko.status.closed}`, 'small'));
    article.append(node('p', `연결 근거: ${pr.evidence.join('; ')}`, 'small muted'));
    article.append(node('p', `관측 SHA: ${pr.headSha.slice(0,12)} · 검사 ${pr.checks.length} · 상태 ${pr.commitStatuses.length}`, 'small'));
    for (const check of pr.checks) article.append(check.url ? link(`${check.name}: ${check.conclusion ?? check.status}`, check.url) : node('p', `${check.name}: ${check.conclusion ?? check.status}`));
    for (const status of pr.commitStatuses) article.append(node('p', `${status.context}: ${status.state}`, 'small'));
    if (!pr.checks.length && !pr.commitStatuses.length) article.append(node('p', 'CI 결과 없음 / 미확인', 'small'));
    const commits = node('details'); commits.append(node('summary', `커밋 ${pr.commits.length}${pr.commits.length >= 250 ? ' (제공자 최대 250개)' : ''}`));
    for (const commit of pr.commits) commits.append(link(commit.sha.slice(0,12), commit.url)); article.append(commits); panel.append(article);
  }
  panel.append(node('p', `GitHub 조회: ${data.githubAsOf ? new Date(data.githubAsOf).toLocaleString('ko-KR', { timeZone: data.timezone }) : '없음'}`, 'small muted'));
  const history = node('details'); history.append(node('summary', `${ko.history} ${data.history.length}`), node('p', ko.historyHelp, 'small muted'));
  for (const snapshot of data.history) history.append(node('p', `${snapshot.observedAt} · 배포일 ${snapshot.release?.releaseDate ?? '미정/현재 조회 없음'} · 티켓 ${snapshot.ticketIds.length}`, 'small'));
  panel.append(history); return panel;
}
