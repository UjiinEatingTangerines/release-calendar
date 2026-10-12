import './style.css';
import './settings.css';
import { node, button, tag } from './dom.js';
import { connectionForm } from './settings-form.js';
import { settingsRead, settingsPost, settingsRemove, settingsSync, errorMessage, probeMessage } from './settings-api.js';
import type { SettingsView } from '../src/core/connection-model.js';

const root = document.getElementById('app'); if (!root) throw new Error('Missing app root');
const app = root;
let view: SettingsView | undefined, selected = '', busy = false, dirty = false;
let notice = '', outcome: 'success' | 'error' | '' = '';
let editor: ReturnType<typeof connectionForm> | undefined;
function select(id: string) {
  if (busy || (dirty && !confirm('입력 중인 내용을 버리고 이동할까요?'))) return;
  selected = id; dirty = false; notice = ''; outcome = ''; render();
}
function status(text: string, kind: typeof outcome = '') {
  notice = text; outcome = kind;
  const region = document.getElementById('settings-status'); if (region) { region.textContent = notice; region.className = `settings-notice ${outcome}`; }
}
function lock(value: boolean) {
  busy = value;
  for (const control of app.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('button,input,select,textarea')) control.disabled = value;
}
async function perform(action: 'save' | 'check') {
  if (!view || !editor || busy || !editor.form.reportValidity()) return;
  try {
    const input = editor.read(view.revision); lock(true); status(action === 'check' ? '조회 권한을 확인하고 있습니다…' : '이 Mac에 설정을 저장하고 있습니다…');
    const result = await settingsPost(action, input, view.csrf);
    if ('jira' in result) {
      status(`Jira: ${probeMessage(result.jira.code)} · GitHub: ${probeMessage(result.github.code)}`, result.jira.ok && result.github.ok ? 'success' : 'error');
    } else {
      view = result; selected = input.project.id; editor.clearSecrets(); dirty = false;
      render(); lock(true); status('저장했습니다. 첫 일정을 조회하고 있습니다…');
      try {
        const sync = await settingsSync(selected);
        status(sync.warnings.length ? '설정은 저장됐지만 일부 데이터를 가져오지 못했습니다. 인증·조회 권한을 확인하고 캘린더에서 다시 새로고침해 주세요.' : '연결 설정과 일정 동기화를 완료했습니다. 캘린더에서 확인하세요.', sync.warnings.length ? 'error' : 'success');
      } catch (error) { status(`설정은 저장됐습니다. ${await errorMessage(error)}`, 'error'); }
    }
  } catch (error) { status(await errorMessage(error), 'error'); }
  finally { lock(false); }
}
async function remove() {
  if (!view || !selected || busy || !confirm('이 Mac에서 연결과 저장된 인증정보를 제거할까요? Jira·GitHub 원본과 관측 캐시는 유지됩니다.')) return;
  lock(true);
  try { view = await settingsRemove(selected, view.revision, view.csrf); selected = ''; dirty = false; notice = '로컬 연결을 해제했습니다.'; outcome = 'success'; render(); }
  catch (error) { status(await errorMessage(error), 'error'); }
  finally { lock(false); }
}
async function reload() {
  if (busy || (dirty && !confirm('입력 내용을 버리고 저장된 설정을 불러올까요?'))) return;
  lock(true);
  try { view = await settingsRead(); if (!view.projects.some((p) => p.project.id === selected)) selected = ''; dirty = false; notice = ''; render(); }
  catch (error) { status(await errorMessage(error), 'error'); }
  finally { lock(false); }
}
function render() {
  const page = node('main', '', 'settings-page');
  const header = node('header', '', 'header'); const title = node('div');
  title.append(node('p', 'RELEASE CALENDAR', 'eyebrow'), node('h1', '연결 설정'), node('p', '연결 정보를 입력하면 달력과 메뉴 막대에 함께 반영됩니다.', 'muted'));
  const back = node('a', '캘린더 열기 ↗', 'settings-back'); back.href = '/'; back.target = '_blank'; back.rel = 'noopener noreferrer'; header.append(title, back); page.append(header);
  const privacy = node('div', '', 'settings-privacy'); privacy.append(tag('이 Mac에만 저장', 'development'), tag('Jira · GitHub 조회 전용', 'qa'), node('p', '토큰은 로컬 파일에 저장되며 공개 저장소에 올라가지 않습니다. 저장된 토큰은 화면에 다시 표시하지 않습니다.', 'small')); page.append(privacy);
  const layout = node('div', '', 'settings-layout'); const list = node('aside', '', 'settings-list'); list.setAttribute('aria-label', '저장된 연결');
  list.append(node('h2', '내 연결'), button('＋ 연결 추가', () => select(''), 'primary'));
  for (const item of view?.projects ?? []) {
    const choice = button(item.project.name, () => select(item.project.id), item.project.id === selected ? 'connection-choice active' : 'connection-choice');
    choice.setAttribute('aria-pressed', String(item.project.id === selected)); list.append(choice);
  }
  if (!view?.projects.length) list.append(node('p', '아직 저장된 연결이 없습니다.', 'small'));
  list.append(button('설정 다시 불러오기', () => void reload())); layout.append(list);
  const content = node('div', '', 'settings-content');
  const steps = node('p', '1. 연결 정보 입력　→　2. 연결 확인　→　3. 저장하고 동기화', 'settings-steps'); content.append(steps);
  const entry = view?.projects.find((p) => p.project.id === selected);
  editor = connectionForm(entry); editor.form.addEventListener('input', () => { dirty = true; }); editor.form.addEventListener('change', () => { dirty = true; });
  editor.form.addEventListener('submit', (event) => { event.preventDefault(); void perform('save'); });
  const region = node('p', notice, `settings-notice ${outcome}`); region.id = 'settings-status'; region.setAttribute('role', 'status'); region.setAttribute('aria-live', 'polite');
  const actions = node('div', '', 'settings-actions');
  actions.append(button('연결 확인', () => void perform('check')), button('저장하고 동기화', () => void perform('save'), 'primary'));
  if (entry) actions.append(button('연결 해제', () => void remove(), 'danger-action'));
  editor.form.append(region, actions); content.append(editor.form, node('p', '로컬 인증 파일은 암호화되지 않습니다. 이 Mac의 사용자 계정 권한으로 보호하며, 원본 업무 데이터를 변경하는 기능은 없습니다.', 'small'));
  layout.append(content); page.append(layout); app.replaceChildren(page);
}
window.addEventListener('beforeunload', (event) => { if (dirty) event.preventDefault(); });
render(); lock(true);
try { view = await settingsRead(); selected = view.projects[0]?.project.id ?? ''; render(); }
catch (error) { status(await errorMessage(error), 'error'); }
finally { lock(false); }
