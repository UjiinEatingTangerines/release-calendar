import { node, link, tag } from './dom.js';
import type { EditableProject, SettingsView, ConnectionInput } from '../src/core/connection-model.js';
import { connectionInputSchema, editableProjectSchema } from '../src/core/connection-model.js';

type Entry = SettingsView['projects'][number];
export function connectionForm(entry?: Entry) {
  const initial: EditableProject = entry?.project ?? editableProjectSchema.parse({
    id: `project-${crypto.randomUUID().slice(0, 8)}`, name: '새 연결', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    jira: { site: 'https://example.atlassian.net', projectKey: 'DEMO' }, github: { repositories: [] },
    ticketDates: { due: { field: 'duedate', type: 'date' } },
  });
  const form = node('form', '', 'connection-form'); form.autocomplete = 'off';
  const inputs = new Map<string, HTMLInputElement | HTMLTextAreaElement>();
  const section = (title: string, subtitle: string, count: string) => {
    const panel = node('section', '', 'settings-card'); const heading = node('div', '', 'settings-card-title');
    heading.append(tag(count, 'settings-step'), node('h2', title)); panel.append(heading, node('p', subtitle, 'muted small')); form.append(panel); return panel;
  };
  const field = (panel: HTMLElement, key: string, label: string, value: string, options: { required?: boolean; secret?: boolean; placeholder?: string; help?: string; multiline?: boolean } = {}) => {
    const wrapper = node('div', '', 'settings-field'), title = node('label', label); title.htmlFor = key;
    const input = options.multiline ? node('textarea') : node('input'); input.id = key; input.name = key; input.value = value;
    input.required = options.required ?? false;
    if (input instanceof HTMLInputElement) { input.type = options.secret ? 'password' : 'text'; if (options.secret) input.autocomplete = 'new-password'; }
    input.placeholder = options.placeholder ?? ''; input.spellcheck = false;
    if (options.help) { const help = node('p', options.help, 'small'); help.id = `${key}-help`; input.setAttribute('aria-describedby', help.id); wrapper.append(title, input, help); }
    else wrapper.append(title, input);
    panel.append(wrapper); inputs.set(key, input); return input;
  };
  const general = section('프로젝트', '여러 서비스는 연결을 나눠 관리할 수 있습니다.', '01');
  field(general, 'connection-name', '연결 이름', entry ? initial.name : '', { required: true, placeholder: '예: Web 릴리스' });
  field(general, 'timezone', '시간대', initial.timezone, { required: true, placeholder: 'Asia/Seoul' });
  const jira = section('Jira Cloud', '릴리스와 티켓을 읽는 기준 연결입니다.', '02');
  jira.append(link('Jira API 토큰 발급 ↗', 'https://id.atlassian.com/manage-profile/security/api-tokens'));
  field(jira, 'jira-site', 'Jira 사이트', entry ? initial.jira.site : '', { required: true, placeholder: 'https://your-site.atlassian.net' });
  field(jira, 'jira-project', '프로젝트 키', entry ? initial.jira.projectKey : '', { required: true, placeholder: '예: DEMO' });
  field(jira, 'jira-email', 'Atlassian 이메일', '', { secret: true, placeholder: entry?.saved.jiraEmail ? '저장됨 · 비워두면 유지' : 'you@example.com', help: '토큰을 발급한 계정의 이메일입니다. 저장된 값은 다시 표시하지 않습니다.' });
  field(jira, 'jira-token', 'Jira API 토큰', '', { secret: true, placeholder: entry?.saved.jiraToken ? '저장됨 · 비워두면 유지' : '발급한 토큰 붙여넣기' });
  field(jira, 'jira-cloud', 'Cloud ID (범위 지정 토큰 사용 시)', initial.jira.cloudId ?? '', { placeholder: '선택 사항 · UUID', help: '범위 지정 토큰에는 Cloud ID가 필요합니다. 일반 API 토큰이면 비워두세요.' });
  const github = section('GitHub', '선택 사항입니다. 관련 PR·커밋·검사 결과를 읽습니다.', '03');
  github.append(link('GitHub 조회용 토큰 발급 ↗', 'https://github.com/settings/personal-access-tokens/new'));
  field(github, 'github-repos', '연결할 저장소', initial.github.repositories.join('\n'), { multiline: true, placeholder: 'owner/repository\nowner/another-repository', help: '한 줄에 하나씩 입력하세요. 저장소 URL도 가능합니다. 비우면 GitHub를 연결하지 않습니다.' });
  field(github, 'github-token', 'GitHub 토큰', '', { secret: true, placeholder: entry?.saved.githubToken ? '저장됨 · 비워두면 유지' : '발급한 토큰 붙여넣기', help: '선택한 저장소의 Metadata·Contents·Pull requests·Checks·Commit statuses 조회 권한을 사용하세요. 조직 승인이나 SSO 승인이 필요할 수 있습니다.' });
  const advanced = node('details', '', 'settings-card'); advanced.append(node('summary', '일정 규칙 · 선택 사항'));
  advanced.append(node('p', `CLI 프로젝트 ID: ${initial.id}`, 'small'));
  field(advanced, 'name-filter', '릴리스 이름에 포함할 글자', initial.releaseNameIncludes ?? '');
  field(advanced, 'freeze-days', '기능 마감 · 배포일 기준 일수', String(initial.rules.featureFreeze?.days ?? ''), { placeholder: '예: -5' });
  field(advanced, 'qa-days', 'QA 시작 · 배포일 기준 일수', String(initial.rules.qa?.days ?? ''), { placeholder: '예: -3' });
  const basis = node('select'); basis.id = 'rule-basis';
  for (const [value, text] of [['weekdays', '평일 기준 (공휴일 제외 안 함)'], ['calendar', '달력일 기준']]) { const option = node('option', text); option.value = value ?? ''; basis.append(option); }
  basis.value = initial.rules.qa?.basis ?? initial.rules.featureFreeze?.basis ?? 'weekdays'; const basisLabel = node('label', '일수 계산 방식'); basisLabel.htmlFor = basis.id; advanced.append(basisLabel, basis);
  form.append(advanced);
  let basisChanged = false; basis.addEventListener('change', () => { basisChanged = true; });
  const value = (key: string) => inputs.get(key)?.value.trim() ?? '';
  return { form, clearSecrets: () => { for (const key of ['jira-email', 'jira-token', 'github-token']) { const input = inputs.get(key); if (input) input.value = ''; } },
    read: (revision: string): ConnectionInput => {
      const site = value('jira-site').replace(/\/$/, '');
      const repo = (text: string) => text.replace(/^https:\/\/github\.com\//, '').replace(/\/$/, '');
      const rule = (key: string) => { const previous = key === 'freeze-days' ? initial.rules.featureFreeze : initial.rules.qa; return value(key) ? { days: Number(value(key)), basis: !basisChanged && previous ? previous.basis : basis.value } : undefined; };
      const freeze = rule('freeze-days'), qa = rule('qa-days'), filter = value('name-filter'), cloudId = value('jira-cloud');
      return connectionInputSchema.parse({ revision, ...(entry ? { originalId: initial.id } : {}),
        project: { ...initial, name: value('connection-name'), timezone: value('timezone'),
          jira: { site: site.startsWith('https://') ? site : `https://${site}`, projectKey: value('jira-project').toUpperCase(), ...(cloudId ? { cloudId } : {}) },
          github: { repositories: value('github-repos').split(/[\n,]+/).filter(Boolean).map((v) => repo(v.trim())) },
          releaseNameIncludes: filter || undefined, rules: { ...(freeze ? { featureFreeze: freeze } : {}), ...(qa ? { qa } : {}) } },
        credentials: { ...(value('jira-email') ? { jiraEmail: value('jira-email') } : {}), ...(value('jira-token') ? { jiraToken: value('jira-token') } : {}), ...(value('github-token') ? { githubToken: value('github-token') } : {}) } });
    } };
}
