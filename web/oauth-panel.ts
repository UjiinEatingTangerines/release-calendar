import ky from 'ky';
import { z } from 'zod';
import { authViewSchema, attemptSchema, siteSchema, choiceSchema, repoSchema, type Provider } from '../src/auth/model.js';
import { node, button, link, tag } from './dom.js';
import { errorMessage, settingsRead, settingsSync } from './settings-api.js';

export function oauthPanel(csrf: string, saved: () => void) {
  const root = node('section', '', 'oauth-panel'); root.setAttribute('aria-label', '브라우저 로그인으로 연결');
  const notice = node('p', '', 'settings-notice'); notice.setAttribute('role', 'status');
  const cards = node('div', '', 'oauth-cards'), choices = node('div', '', 'settings-card');
  root.append(node('h2', '로그인으로 연결'), node('p', '브라우저에서 승인한 뒤 프로젝트와 저장소를 선택하세요. API 토큰을 복사하지 않아도 됩니다.', 'muted'), cards, choices, notice);
  const client = ky.create({ prefix: '/api/settings/oauth', retry: 0, timeout: 60000, headers: { 'X-Release-Settings': csrf } });
  let view: z.infer<typeof authViewSchema> | undefined;
  let jiraGrant = '', githubGrant = '', timer: ReturnType<typeof setTimeout> | undefined, pending = '', disposed = false, starting = false;
  let sites: z.infer<typeof siteSchema>[] = [], projects: z.infer<typeof choiceSchema>[] = [], repositories: z.infer<typeof repoSchema>[] = [];
  const selectedRepos = new Set<string>();
  let siteId = '', projectKey = '', name = '';
  const message = (text: string, error = false) => { notice.textContent = text; notice.className = `settings-notice ${error ? 'error' : 'success'}`; };
  async function run(operation: () => Promise<void>) { try { await operation(); } catch (error) { if (!(error instanceof Error)) throw error; message(await errorMessage(error), true); } }
  async function refresh() { view = authViewSchema.parse(await ky.get('/api/settings/oauth', { retry: 0, timeout: 60000 }).json()); renderCards(); }
  async function loadSites() {
    const requested = jiraGrant;
    const result = z.array(siteSchema).parse(await client.get(`sites?${new URLSearchParams({ grant: requested })}`).json());
    if (requested !== jiraGrant || disposed) return; sites = result;
    siteId = sites[0]?.id ?? ''; await loadProjects();
  }
  async function loadProjects() {
    const requested = siteId, grant = jiraGrant;
    const result = requested ? z.array(choiceSchema).parse(await client.get(`projects?${new URLSearchParams({ grant, site: requested })}`).json()) : [];
    if (requested !== siteId || grant !== jiraGrant || disposed) return; projects = result;
    projectKey = projects[0]?.key ?? ''; name = projects[0]?.name ?? ''; renderChoices();
  }
  async function loadRepos() {
    const requested = githubGrant;
    const result = z.array(repoSchema).parse(await client.get(`repositories?${new URLSearchParams({ grant: requested })}`).json());
    if (requested !== githubGrant || disposed) return; repositories = result;
    selectedRepos.clear(); renderChoices();
    if (!repositories.length) message('저장소가 없습니다. GitHub App을 사용할 저장소에 설치한 뒤 목록을 다시 불러오세요.', true);
  }
  async function poll(id: string) {
    if (disposed || pending !== id) return;
    try {
      const result = attemptSchema.parse(await client.get(`status?id=${encodeURIComponent(id)}`).json());
      switch (result.status) {
        case 'pending': timer = setTimeout(() => void poll(id), 1200); return;
        case 'error': pending = ''; await refresh(); message(oauthError(result.code ?? ''), true); return;
        case 'complete':
          pending = ''; await refresh();
          if (result.grantId) {
            const grant = view?.grants.find(g => g.id === result.grantId);
            if (grant?.provider === 'jira') { jiraGrant = grant.id; await loadSites(); }
            if (grant?.provider === 'github') { githubGrant = grant.id; await loadRepos(); }
          }
          message('로그인했습니다. 연결할 프로젝트와 저장소를 선택하세요.'); return;
      }
    } catch (error) { if (!(error instanceof Error)) throw error; pending = ''; renderCards(); message(await errorMessage(error), true); }
  }
  async function start(provider: Provider, grantId?: string) {
    if (starting || pending) return;
    starting = true; renderCards(); message('브라우저 로그인을 준비하고 있습니다…');
    try {
    const result = z.object({ id: z.string(), url: z.url() }).parse(await client.post('start', { json: { provider, ...(grantId ? { grantId } : {}) } }).json());
    pending = result.id; renderCards(); message('브라우저에서 로그인과 조회 권한 승인을 완료해 주세요.');
    const forward = link('브라우저에서 로그인 계속하기 ↗', result.url); notice.append(node('br'), forward);
    forward.click(); void poll(result.id);
    } finally { starting = false; renderCards(); }
  }
  function setup(provider: Provider, card: HTMLElement) {
    const details = node('details', '', 'oauth-setup'); details.open = false; details.append(node('summary', '최초 1회 · 앱 소유자 등록 설정'));
    details.append(node('p', '개인용 앱을 등록한 소유자가 한 번 설정합니다. 사용자 API 토큰이 아닙니다. 이미 등록된 앱이면 해당 앱 정보를 사용하세요.', 'small'));
    details.append(link(provider === 'jira' ? 'Atlassian 개발자 콘솔 열기 ↗' : 'GitHub App 등록 화면 열기 ↗', provider === 'jira' ? 'https://developer.atlassian.com/console/myapps/' : 'https://github.com/settings/apps/new'));
    details.append(node('p', `Callback URL: ${view?.callback ?? ''}${provider}`, 'oauth-callback small'));
    details.append(node('p', provider === 'jira' ? 'OAuth 2.0 (3LO) 앱에 Jira API의 read:jira-work 권한을 추가하세요. 로그인 시 갱신용 offline_access도 요청합니다.' : 'GitHub App의 Metadata·Contents·Pull requests·Checks·Commit statuses를 Read-only로 설정하고 Webhook을 끄세요. 저장 후 사용할 저장소에 앱을 설치하세요. 일반 OAuth App은 사용하지 않습니다.', 'small'));
    const form = node('form'); form.autocomplete = 'off';
    const id = node('input'), secret = node('input'); id.id = `oauth-${provider}-client`; secret.id = `oauth-${provider}-secret`;
    id.required = true; secret.required = true; id.autocomplete = 'off'; secret.type = 'password'; secret.autocomplete = 'new-password';
    const idLabel = node('label', 'Client ID'); idLabel.htmlFor = id.id; const secretLabel = node('label', 'Client secret'); secretLabel.htmlFor = secret.id;
    const save = node('button', '앱 등록 정보 저장'); save.type = 'submit';
    form.append(idLabel, id, secretLabel, secret, save); details.append(form); card.append(details);
    form.addEventListener('submit', event => {
      event.preventDefault(); if (!form.reportValidity()) return;
      if (view?.apps[provider] && !confirm('앱 등록 정보를 바꾸면 이 서비스의 기존 로그인이 해제됩니다. 계속할까요?')) return;
      save.disabled = true;
      void run(async () => { await client.post('configure', { json: { provider, clientId: id.value, clientSecret: secret.value } }); secret.value = ''; await refresh(); message('앱 등록 정보를 저장했습니다. 로그인 버튼을 눌러 연결하세요.'); }).finally(() => { save.disabled = false; });
    });
  }
  function renderCards() {
    cards.replaceChildren();
    for (const provider of ['jira', 'github'] as const) {
      const label = provider === 'jira' ? 'Jira' : 'GitHub', card = node('div', '', 'settings-card oauth-card');
      card.append(node('h3', label), tag(view?.apps[provider] ? '로그인 준비됨' : '앱 등록 필요', view?.apps[provider] ? 'development' : 'freeze'));
      const ready = !!view?.apps[provider];
      const signIn = button(starting ? '로그인 준비 중…' : pending ? '브라우저 승인 대기 중' : ready ? `${label} 로그인` : `${label} 로그인 준비하기`, () => {
        if (ready) { void run(() => start(provider)); return; }
        const details = card.querySelector('details');
        if (details) { details.open = true; details.querySelector('summary')?.focus(); details.scrollIntoView({ block: 'nearest' }); }
      }, 'primary');
      signIn.disabled = !view || !!pending || starting; card.append(signIn);
      if (view && !view.apps[provider]) {
        const hint = node('p', '로그인 준비가 필요합니다. 아래 ‘최초 1회 · 앱 소유자 등록 설정’을 완료하면 로그인할 수 있습니다.', 'small');
        hint.id = `oauth-${provider}-setup-hint`; signIn.setAttribute('aria-describedby', hint.id); card.append(hint);
      }
      const grants = view?.grants.filter(g => g.provider === provider) ?? [];
      for (const grant of grants) {
        const use = button(`${label} 로그인 사용 · ${new Date(grant.createdAt).toLocaleString()}`, () => void run(async () => {
          if (provider === 'jira') { jiraGrant = grant.id; await loadSites(); } else { githubGrant = grant.id; await loadRepos(); }
        }));
        use.disabled = grant.reconnect; card.append(use);
        const reconnect = button(`${label} 다시 인증`, () => void run(() => start(provider, grant.id))); reconnect.disabled = !!pending || starting; card.append(reconnect);
        if (grant.reconnect) card.append(tag('다시 로그인 필요', 'freeze'));
        card.append(button('로컬 로그아웃', () => {
          if (!confirm('이 로그인을 사용하는 모든 연결에서 재인증이 필요합니다. 로컬 로그인 정보를 삭제할까요? 서비스의 앱 승인은 별도로 철회해야 합니다.')) return;
          void run(async () => { await client.post('forget', { json: { id: grant.id } }); if (jiraGrant === grant.id) { jiraGrant = ''; sites = []; projects = []; } if (githubGrant === grant.id) { githubGrant = ''; repositories = []; selectedRepos.clear(); } renderChoices(); await refresh(); });
        }, 'danger-action'));
      }
      if (provider === 'github') setup(provider, card);
      else card.append(node('p', '브라우저에서 Atlassian에 로그인하고 승인하세요. 인증은 이 기기에 저장되며 다음 실행에서도 사용됩니다.', 'small'));
      cards.append(card);
    }
    if (pending) cards.append(button('로그인 취소', () => void run(async () => { const id = pending; pending = ''; if (timer) clearTimeout(timer); await client.post('cancel', { json: { id } }); await refresh(); message('로그인을 취소했습니다.'); })));
  }
  function renderChoices() {
    choices.replaceChildren(node('h3', '연결할 대상 선택'));
    if (!jiraGrant) { choices.append(node('p', 'Jira 로그인 후 접근 가능한 사이트와 프로젝트가 표시됩니다.', 'muted')); return; }
    const select = (label: string, id: string, values: readonly { readonly value: string; readonly text: string }[], selected: string) => {
      const control = node('select'); control.id = id; const title = node('label', label); title.htmlFor = id;
      for (const value of values) { const option = node('option', value.text); option.value = value.value; control.append(option); }
      control.value = selected; choices.append(title, control); return control;
    };
    const site = select('Jira 사이트', 'oauth-site', sites.map(s => ({ value: s.id, text: s.name })), siteId);
    site.addEventListener('change', () => { siteId = site.value; projects = []; projectKey = ''; renderChoices(); void run(loadProjects); });
    const project = select('프로젝트', 'oauth-project', projects.map(p => ({ value: p.key, text: `${p.name} (${p.key})` })), projectKey);
    project.addEventListener('change', () => { projectKey = project.value; });
    if (!sites.length || !projects.length) choices.append(node('p', '접근 가능한 프로젝트가 없습니다. Jira 승인 범위와 프로젝트 조회 권한을 확인하세요.', 'small'));
    const nameLabel = node('label', '연결 이름'), nameInput = node('input'); nameInput.id = 'oauth-name'; nameInput.value = name; nameLabel.htmlFor = nameInput.id; nameInput.addEventListener('input', () => { name = nameInput.value; }); choices.append(nameLabel, nameInput);
    if (githubGrant) {
      choices.append(node('h4', 'GitHub 저장소 · 선택 사항'), button('저장소 목록 다시 불러오기', () => void run(loadRepos)));
      for (const repo of repositories) { const row = node('label', '', 'oauth-repo'), input = node('input'); input.type = 'checkbox'; input.checked = selectedRepos.has(repo.full_name); input.addEventListener('change', () => { if (input.checked) selectedRepos.add(repo.full_name); else selectedRepos.delete(repo.full_name); }); row.append(input, document.createTextNode(repo.full_name)); choices.append(row); }
    }
    const save = button('선택한 대상으로 연결', () => void run(async () => {
      save.disabled = true;
      try {
        const current = await settingsRead();
        const result = z.object({ id: z.string() }).parse(await client.post('select', { json: { revision: current.revision, name, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, jiraGrant, cloudId: siteId, projectKey, ...(githubGrant ? { githubGrant } : {}), repositories: [...selectedRepos] } }).json());
        message('연결을 저장했습니다. 첫 일정을 조회합니다…');
        try { const sync = await settingsSync(result.id); message(sync.warnings.length ? '연결은 저장됐지만 일부 조회가 실패했습니다. 캘린더에서 권한과 갱신 상태를 확인하세요.' : '연결과 동기화를 완료했습니다.', !!sync.warnings.length); }
        catch (error) { if (!(error instanceof Error)) throw error; message(`연결은 저장됐습니다. ${await errorMessage(error)}`, true); }
        saved();
      } finally { save.disabled = false; }
    }), 'primary'); save.disabled = !projectKey; choices.append(save);
  }
  renderCards(); renderChoices(); void run(refresh);
  return { element: root, dispose: () => { disposed = true; if (timer) clearTimeout(timer); } };
}
function oauthError(code: string) {
  const messages: Record<string, string> = { OAUTH_DENIED: '로그인 승인이 취소됐습니다. 다시 로그인할 수 있습니다.', OAUTH_EXPIRED: '로그인 시간이 만료됐습니다. 다시 시도하세요.', OAUTH_CANCELLED: '로그인을 취소했습니다.' };
  return messages[code] ?? '인증을 완료하지 못했습니다. 앱 등록 정보와 승인 상태를 확인하고 다시 로그인하세요.';
}
