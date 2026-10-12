import { projectSchema } from './config.js';
import { addDays, dateInZone, dateSchema } from './core/dates.js';
import { snapshotSchema, type State } from './core/model.js';
import { configHash, emptyState, recordSnapshot } from './storage.js';

export const demoProject = projectSchema.parse({
  id: 'demo', name: 'Orbit · 가상 프로젝트', timezone: 'Asia/Seoul',
  jira: { site: 'https://fictional-orbit.atlassian.net', projectKey: 'DEMO', emailEnv: 'JIRA_EMAIL', tokenEnv: 'JIRA_TOKEN' },
  github: { repositories: ['fictional-orbit/web', 'fictional-orbit/api'], tokenEnv: 'GITHUB_TOKEN' },
  ticketDates: { start: { field: 'customfield_10015', type: 'date' }, due: { field: 'duedate', type: 'date' } },
  rules: { featureFreeze: { days: -5, basis: 'weekdays' }, qa: { days: -3, basis: 'weekdays' } },
});
export function demoState(now = new Date()): State {
  const today = dateInZone(now, demoProject.timezone);
  const month = today.slice(0,7);
  const date = (day: number) => dateSchema.parse(`${month}-${String(day).padStart(2,'0')}`);
  const rid = (id: number) => `jira:https://fictional-orbit.atlassian.net:100:${id}`;
  const snapshot = snapshotSchema.parse({ observedAt: now.toISOString(), githubObservedAt: now.toISOString(),
    releases: [
      { id: rid(1), versionId: '1', projectId: '100', name: 'Web 1.8', startDate: addDays(date(1), -4), releaseDate: date(14), released: false, archived: false, url: 'https://example.com/releases/web-1-8' },
      { id: rid(2), versionId: '2', projectId: '100', name: 'API 2.4', startDate: date(7), releaseDate: date(22), released: false, archived: false, url: 'https://example.com/releases/api-2-4' },
      { id: rid(3), versionId: '3', projectId: '100', name: 'Web 1.9', startDate: date(20), releaseDate: addDays(date(28), 8), released: false, archived: false, url: 'https://example.com/releases/web-1-9' },
      { id: rid(4), versionId: '4', projectId: '100', name: 'SDK 0.7 · 일정 미정', startDate: null, releaseDate: null, released: false, archived: false, url: 'https://example.com/releases/sdk-0-7' },
      { id: rid(5), versionId: '5', projectId: '100', name: 'Web 1.7 · 이전 릴리스', startDate: addDays(date(1), -30), releaseDate: addDays(date(1), -8), released: true, archived: true, url: 'https://example.com/releases/web-1-7' },
    ],
    tickets: [
      { id: 'demo-101', key: 'DEMO-101', title: '검색 결과 정렬', status: '진행 중', done: false, assignee: '가상 개발자 A', startDate: date(3), dueDate: date(10), dateSources: ['customfield_10015', 'duedate'], releaseIds: [rid(1)], url: 'https://example.com/tickets/DEMO-101' },
      { id: 'demo-102', key: 'DEMO-102', title: '키보드 접근성 개선', status: '검토 중', done: false, assignee: '가상 개발자 B', startDate: null, dueDate: null, dateSources: [], releaseIds: [rid(1)], url: 'https://example.com/tickets/DEMO-102' },
      { id: 'demo-103', key: 'DEMO-103', title: '페이지네이션 응답 개선', status: '완료', done: true, assignee: null, startDate: date(8), dueDate: date(17), dateSources: ['customfield_10015', 'duedate'], releaseIds: [rid(2)], url: 'https://example.com/tickets/DEMO-103' },
      { id: 'demo-104', key: 'DEMO-104', title: '설정 화면 안내', status: '계획', done: false, assignee: null, startDate: null, dueDate: null, dateSources: [], releaseIds: [rid(3)], url: 'https://example.com/tickets/DEMO-104' },
    ],
    pulls: [{ id: 'fictional-pr-17', repositoryId: 'fictional-repo-1', repository: 'fictional-orbit/web', number: 17,
      title: 'DEMO-101 검색 결과 정렬', url: 'https://example.com/pulls/17', state: 'open', mergedAt: null, headSha: 'abcdef012345',
      ticketIds: ['demo-101'], evidence: ['Exact issue key DEMO-101 in PR title (fictional demo)'], commits: [{ sha: 'abcdef012345', url: 'https://example.com/commits/abcdef012345' }],
      checks: [{ id: 1, name: 'Unit tests', status: 'completed', conclusion: 'success', url: 'https://example.com/checks/1' }], commitStatuses: [] }],
  });
  return { ...recordSnapshot(emptyState(configHash(demoProject)), snapshot), lastAttemptAt: now.toISOString() };
}
