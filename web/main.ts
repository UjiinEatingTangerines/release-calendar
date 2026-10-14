import './style.css';
import { api, type CalendarView, type DetailView, type ProjectsView } from './api.js';
import { renderCalendar } from './calendar.js';
import { renderDetail } from './detail.js';
import { button, node, tag } from './dom.js';
import { ko } from './i18n.js';
import { addDays, dateInZone, dateSchema, type LocalDate } from '../src/core/dates.js';

const root = document.getElementById('app');
if (!root) throw new Error('Missing app root');
const app = root;
let projects: ProjectsView = { mode: 'demo', projects: [] };
let project = 'demo', month = '', release = '', showTickets = false, refreshing = false, loading = true, error = '';
let data: CalendarView | null = null, detail: DetailView | null = null, selectedDate: LocalDate | null = null;
let request = 0, detailRequest = 0;
const expanded = new Set<string>();
function focus(id: string) { document.getElementById(id)?.focus({ preventScroll: true }); }
function render() {
  const focused = document.activeElement?.id;
  const main = node('main', '', 'page');
  const header = node('header', '', 'header');
  const identity = node('div'); identity.append(node('p', ko.eyebrow, 'eyebrow'), node('h1', ko.title), node('p', ko.subtitle, 'muted'));
  const badge = tag(projects.mode === 'demo' ? ko.demo : ko.live, 'mode'); const actions = node('div', '', 'header-actions'); const settings = node('a', '연결 설정'); settings.href = '/settings.html'; actions.append(badge, settings); header.append(identity, actions); main.append(header);
  const controls = node('div', '', 'controls');
  const projectLabel = node('label', ko.project), projectSelect = node('select'); projectSelect.id = 'project';
  for (const p of projects.projects) { const option = node('option', p.name); option.value = p.id; projectSelect.append(option); } projectSelect.value = project;
  projectSelect.addEventListener('change', () => { project = projectSelect.value; release = ''; detail = null; data = null; detailRequest++; void load(); }); projectLabel.append(projectSelect);
  const releaseLabel = node('label', ko.release), releaseSelect = node('select'); releaseSelect.id = 'release-filter';
  const all = node('option', ko.all); all.value = ''; releaseSelect.append(all);
  for (const r of data?.releases ?? []) { const option = node('option', r.name); option.value = r.id; releaseSelect.append(option); } releaseSelect.value = release;
  releaseSelect.addEventListener('change', () => { release = releaseSelect.value; if (release && detail?.release.id !== release) { detail = null; detailRequest++; } expanded.clear(); render(); }); releaseLabel.append(releaseSelect);
  const checkboxLabel = node('label', '', 'checkbox-label'), checkbox = node('input'); checkbox.type = 'checkbox'; checkbox.id = 'ticket-toggle'; checkbox.checked = showTickets;
  checkbox.addEventListener('change', () => { showTickets = checkbox.checked; render(); }); checkboxLabel.append(checkbox, document.createTextNode(ko.tickets));
  const refresh = button(refreshing ? ko.refreshing : ko.refresh, () => void refreshData(), 'primary'); refresh.id = 'refresh'; refresh.disabled = refreshing;
  controls.append(projectLabel, releaseLabel, checkboxLabel, refresh); main.append(controls);
  const toolbar = node('div', '', 'month-toolbar');
  const title = node('div', '', 'month-title'); const parts = month.split('-'); title.append(node('span', parts[0] ?? '', 'year'), node('h2', `${Number(parts[1]) || ''}월`));
  const nav = node('nav', '', 'month-nav'); nav.setAttribute('aria-label','월 이동');
  const previous = button('‹', () => navigate(-1)); previous.id = 'previous'; previous.setAttribute('aria-label',ko.previous);
  const next = button('›', () => navigate(1)); next.id = 'next'; next.setAttribute('aria-label',ko.next);
  const today = button(ko.today, () => { const zone = projects.projects.find((p) => p.id === project)?.timezone ?? 'UTC'; selectedDate = data?.today ?? dateInZone(new Date(),zone); month = selectedDate.slice(0,7); void load(); }); today.id = 'today';
  const monthInput = node('input'); monthInput.type = 'month'; monthInput.id = 'month'; monthInput.value = month; monthInput.setAttribute('aria-label','조회 월');
  monthInput.addEventListener('change', () => { if (monthInput.value) { month = monthInput.value; expanded.clear(); void load(); } });
  nav.append(monthInput, today, previous, next); toolbar.append(title, nav); main.append(toolbar);
  const legend = node('div', '', 'legend'); legend.setAttribute('aria-label', ko.legend);
  for (const kind of ['development','freeze','qa','release'] as const) legend.append(tag(`${ko.kinds[kind]}${kind === 'freeze' || kind === 'qa' ? ' · 예상' : ' · Jira'}`,kind)); main.append(legend);
  const notice = node('div', '', 'freshness'); notice.setAttribute('role','status');
  if (data) {
    const time = data.dataAsOf ? new Date(data.dataAsOf).toLocaleString('ko-KR', { timeZone: data.timezone }) : ko.pending;
    notice.append(node('span', `${ko.latest}: ${time} · ${data.timezone}${projects.mode === 'live' ? ' · 자동 동기화: 시작 시 및 조회 완료 후 5분마다' : ''}`));
    const failures = node('div', '', 'provider-failures');
    for (const [provider, label] of [['jira', 'Jira'], ['github', 'GitHub']] as const) {
      if (data.warnings.some(warning => warning.startsWith(`${provider}:`))) failures.append(tag(`${label} 조회 실패`, 'provider-failure'));
    }
    if (failures.childElementCount) notice.append(failures);
    for (const warning of data.warnings) notice.append(node('p', `주의 · ${warning.includes('OAUTH_REAUTHORIZE') ? 'Jira 또는 GitHub 연결 설정에서 다시 로그인해 주세요.' : warning}`, 'warning'));
    if (!data.registeredFuturePlans) notice.append(node('p', `${ko.noPlans}. ${ko.noFuture}`, 'muted'));
  }
  if (loading) notice.append(node('p', '일정을 불러오는 중입니다.'));
  if (error) notice.append(node('p', error, 'error')); main.append(notice);
  const layout = node('div', '', 'layout');
  if (data) layout.append(renderCalendar(data, { selectedDate, release, tickets: showTickets, expanded }, {
    selectDate: (date) => { selectedDate = date; if (!data?.days.includes(date)) { month = date.slice(0,7); void load(`day-${date}`); } else { render(); focus(`day-${date}`); } },
    selectRelease: (id) => void selectRelease(id), expand: (key) => { expanded.has(key) ? expanded.delete(key) : expanded.add(key); render(); },
  }));
  else layout.append(node('div', '월간 일정을 준비하고 있습니다.', 'calendar-placeholder'));
  layout.append(renderDetail(detail)); main.append(layout);
  if (data) {
    const undated = node('section', '', 'undated'); undated.append(node('h2', `${ko.undated} ${data.undated.filter((r) => !release || release === r.id).length}`));
    for (const r of data.undated.filter((r) => !release || release === r.id)) undated.append(button(`${r.name} ↗`, () => void selectRelease(r.id)));
    main.append(undated);
    const footer = node('footer'); footer.append(node('p', ko.coverage), node('p', `관측 시작: ${data.firstObservedAt ?? '없음'} · 최초 연동 이전의 일정 변경 이력은 알 수 없습니다.`), node('p','원본 변경은 Jira·GitHub에서 직접 수행하세요. 이 앱은 브랜치·PR·배포를 실행하지 않습니다.')); main.append(footer);
  }
  app.replaceChildren(main); if (focused) focus(focused);
}
function navigate(amount: number) {
  const first = dateSchema.parse(`${month}-01`);
  month = (amount < 0 ? addDays(first,-1) : addDays(first,32)).slice(0,7); expanded.clear(); void load();
}
async function load(focusId?: string) {
  const serial = ++request; loading = true; error = ''; render();
  try {
    const result = await api.calendar(project,month); if (serial !== request) return;
    data = result; if (!selectedDate || !result.days.includes(selectedDate)) selectedDate = result.days.find((d) => d === result.today) ?? dateSchema.parse(`${month}-01`);
  } catch (failure) { if (!(failure instanceof Error)) throw failure; if (serial === request) { error = ko.failed; if (data) month = data.month; } }
  finally { if (serial === request) { loading = false; render(); if (focusId) focus(focusId); } }
}
async function selectRelease(id: string) {
  const serial = ++detailRequest; error = '';
  try { const result = await api.detail(project,id); if (serial === detailRequest) { detail = result; render(); } }
  catch (failure) { if (!(failure instanceof Error)) throw failure; if (serial === detailRequest) { error = ko.failed; render(); } }
}
async function refreshData() {
  refreshing = true; render();
  try { await api.refresh(project); if (detail) await selectRelease(detail.release.id); await load(); }
  catch (failure) { if (!(failure instanceof Error)) throw failure; error = ko.failed; }
  finally { refreshing = false; render(); }
}
try {
  const query = new URLSearchParams(location.search); const requestedMonth = query.get('month');
  projects = await api.projects(); const first = projects.projects.find((p) => p.id === query.get('project')) ?? projects.projects[0]; if (!first) throw new Error('No projects'); project = first.id;
  month = dateInZone(new Date(),first.timezone).slice(0,7);
  if (requestedMonth && /^\d{4}-(0[1-9]|1[0-2])$/.test(requestedMonth)) month = requestedMonth;
  await load();
  const requestedRelease = query.get('release');
  if (requestedRelease) await selectRelease(requestedRelease);
} catch (failure) { if (!(failure instanceof Error)) throw failure; loading = false; error = '앱을 불러오지 못했습니다. 서버와 설정을 확인한 후 페이지를 새로고침하세요.'; render(); }

window.addEventListener('focus', () => {
  void (async () => {
    try {
      projects = await api.projects();
      if (!projects.projects.some((p) => p.id === project)) {
        project = projects.projects[0]?.id ?? ''; release = ''; detail = null; data = null; detailRequest++;
      }
      if (project) await load();
    } catch (failure) { if (!(failure instanceof Error)) throw failure; error = ko.failed; render(); }
  })();
});

// Poll local snapshots only; the server owns provider synchronization.
window.setInterval(() => {
  if (document.hidden || loading || refreshing || projects.mode !== 'live') return;
  const serial = request, selected = project, selectedMonth = month;
  void api.calendar(selected, selectedMonth).then(result => {
    if (loading || refreshing || serial !== request || selected !== project || selectedMonth !== month) return;
    if (JSON.stringify(result) === JSON.stringify(data)) return;
    data = result; render();
    if (detail) void selectRelease(detail.release.id);
  }).catch((failure: unknown) => { if (!(failure instanceof Error)) throw failure; error = ko.failed; render(); });
}, 15000);
