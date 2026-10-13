import ky from 'ky';
import { z } from 'zod';
import { authViewSchema, attemptSchema, siteSchema, choiceSchema, repoSchema, type Provider } from '../src/auth/model.js';
import { node, button, link, tag } from './dom.js';
import { errorMessage, settingsRead, settingsSync } from './settings-api.js';

export function oauthPanel(csrf: string, saved: () => void) {
  const root = node('section', '', 'oauth-panel'); root.setAttribute('aria-label', '브라우저 로그인으로 연결');
  const notice = node('p', '', 'settings-notice'); notice.setAttribute('role', 'status');
  const cards = node('div', '', 'oauth-cards'), choices = node('div', '', 'settings-card');
  root.append(node('h2', '로그인으로 연결'), node('p', '브라우저에서 승인한 뒤 프로젝트와 저장소를 선택하세요. API 토큰을 복사하지 않아도 됩니다.', 'muted'), cards, notice, choices);
  const client = ky.create({ prefix: '/api/settings/oauth', retry: 0, timeout: 60000, headers: { 'X-Release-Settings': csrf } });
  let view: z.infer<typeof authViewSchema> | undefined;
  let jiraGrant = '', githubGrant = '', timer: ReturnType<typeof setTimeout> | undefined, pending = '', disposed = false, starting = false;
  let sites: z.infer<typeof siteSchema>[] = [], projects: z.infer<typeof choiceSchema>[] = [], repositories: z.infer<typeof repoSchema>[] = [];
  const selectedRepos = new Set<string>();
  let siteId = '', projectKey = '', name = '';
  const message = (text: string, error = false) => { notice.textContent = text; notice.className = `settings-notice ${error ? 'error' : 'success'}`; };
  async function run(operation: () => Promise<void>) { try { await operation(); } catch (error) { if (!(error instanceof Error)) throw error; message(await errorMessage(error), true); } }
  async function refresh() {
    view = authViewSchema.parse(await ky.get('/api/settings/oauth', { retry: 0, timeout: 60000 }).json());
    const recovered = view.pendingAttempt?.id;
    if (recovered && recovered !== pending) {
      pending = recovered;
      if (timer) clearTimeout(timer);
      message('진행 중인 로그인이 있습니다. 브라우저에서 승인을 완료하거나 로그인 취소 후 다시 시도하세요.');
      void poll(recovered);
    } else if (!recovered && pending) {
      pending = ''; if (timer) clearTimeout(timer);
    }
    renderCards();
  }
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
      if (disposed || pending !== id) return;
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
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      if (disposed || pending !== id) return;
      renderCards(); message(`${await errorMessage(error)} 로그인 취소 후 다시 시도할 수 있습니다.`, true);
      timer = setTimeout(() => void poll(id), 5000);
    }
  }
  async function start(provider: Provider, grantId?: string) {
    if (starting || pending || view?.grants.some(g => g.provider === provider && !g.reconnect)) return;
    starting = true; renderCards(); message('브라우저 로그인을 준비하고 있습니다…');
    try {
    const result = z.object({ id: z.string(), url: z.url(), userCode: z.string().optional() }).parse(await client.post('start', { json: { provider, ...(grantId ? { grantId } : {}) } }).json());
    pending = result.id; renderCards(); message('브라우저에서 로그인과 앱 승인을 완료해 주세요.');
    if (result.userCode) {
      notice.append(node('p', 'GitHub 화면에 아래 일회용 코드를 입력하고 승인하세요.'), node('strong', result.userCode));
      const code = result.userCode;
      const copy = button('인증 코드 복사', () => {
        if (!navigator.clipboard) { copy.textContent = '코드를 직접 복사하세요'; return; }
        void navigator.clipboard.writeText(code).then(() => { copy.textContent = '복사됨'; }, () => { copy.textContent = '코드를 직접 복사하세요'; });
      });
      notice.append(copy);
    }
    const forward = link('브라우저에서 로그인 계속하기 ↗', result.url); notice.append(node('br'), forward);
    forward.click(); notice.scrollIntoView({ block: 'nearest' }); void poll(result.id);
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      await refresh();
      throw error;
    } finally { starting = false; renderCards(); }
  }
  function renderCards() {
    cards.replaceChildren();
    for (const provider of ['jira', 'github'] as const) {
      const label = provider === 'jira' ? 'Jira' : 'GitHub', card = node('div', '', 'settings-card oauth-card');
      const grants = view?.grants.filter(g => g.provider === provider && !g.reconnect) ?? [];
      const authenticated = grants.length > 0;
      card.append(node('h3', label), tag(authenticated ? '로그인됨' : '로그아웃', authenticated ? 'development' : 'freeze'));
      const ready = !!view?.apps[provider];
      const signIn = button(authenticated ? `${label} 로그인됨` : starting ? '로그인 준비 중…' : pending ? '브라우저 승인 대기 중' : ready ? `${label} 로그인` : `${label} 로그인 준비하기`, () => {
        if (ready) { void run(() => start(provider)); return; }
        message('GitHub CLI(gh)를 설치한 뒤 앱을 다시 시작하세요. 아래 설치 안내를 확인하세요.', true);
      }, 'primary');
      signIn.disabled = authenticated || !view || !!pending || starting; card.append(signIn);
      if (view && !view.apps[provider]) {
        const hint = node('p', 'GitHub CLI(gh)가 필요합니다. 설치 후 앱을 다시 시작하면 브라우저로 로그인할 수 있습니다.', 'small');
        card.append(link('GitHub CLI 설치 안내 ↗', 'https://cli.github.com/'));
        hint.id = `oauth-${provider}-setup-hint`; signIn.setAttribute('aria-describedby', hint.id); card.append(hint);
      }
      for (const grant of grants) {
        const time = node('time', `인증 시각: ${new Date(grant.createdAt).toLocaleString()}`, 'small'); time.dateTime = grant.createdAt; card.append(time);
        const use = button(`${label} 연결 대상 선택`, () => void run(async () => {
          if (provider === 'jira') { jiraGrant = grant.id; await loadSites(); } else { githubGrant = grant.id; await loadRepos(); }
        }));
        card.append(use);
        card.append(button('로컬 로그아웃', () => {
          if (!confirm('이 로그인을 사용하는 모든 연결에서 재인증이 필요합니다. 로컬 로그인 정보를 삭제할까요? 서비스의 앱 승인은 별도로 철회해야 합니다.')) return;
          void run(async () => { await client.post('forget', { json: { id: grant.id } }); if (jiraGrant === grant.id) { jiraGrant = ''; sites = []; projects = []; } if (githubGrant === grant.id) { githubGrant = ''; repositories = []; selectedRepos.clear(); } renderChoices(); await refresh(); message(`${label} 로컬 로그아웃을 완료했습니다. 다시 인증하면 기존 연결을 계속 사용할 수 있습니다.`); });
        }, 'danger-action'));
      }
      if (provider === 'github') card.append(node('p', 'GitHub CLI의 브라우저 인증을 사용합니다. 승인 권한에는 쓰기가 포함될 수 있지만 이 앱은 조회만 수행합니다. 기존 터미널 계정 설정은 변경하지 않습니다.', 'small'));
      else card.append(node('p', '브라우저에서 Atlassian에 로그인하고 승인하세요. 인증은 이 기기에 저장되며 다음 실행에서도 사용됩니다.', 'small'));
      cards.append(card);
    }
    if (pending) cards.append(button('로그인 취소', () => void run(async () => { const id = pending; await client.post('cancel', { json: { id } }); pending = ''; if (timer) clearTimeout(timer); await refresh(); message('로그인을 취소했습니다.'); })));
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
