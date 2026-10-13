import ky, { HTTPError } from 'ky';
import { z } from 'zod';
import { settingsViewSchema, probeResultSchema, type ConnectionInput } from '../src/core/connection-model.js';
const client = ky.create({ timeout: 120000, retry: 0 });
export async function settingsRead() { return settingsViewSchema.parse(await client.get('/api/settings').json<unknown>()); }
export async function settingsPost(action: 'save' | 'check', input: ConnectionInput, csrf: string) {
  const result = await client.post(`/api/settings/${action}`, { headers: { 'X-Release-Settings': csrf }, json: input }).json<unknown>();
  return action === 'save' ? settingsViewSchema.parse(result) : probeResultSchema.parse(result);
}
export async function settingsRemove(id: string, revision: string, csrf: string) {
  return settingsViewSchema.parse(await client.post('/api/settings/remove', { headers: { 'X-Release-Settings': csrf }, json: { id, revision } }).json<unknown>());
}
export async function settingsSync(project: string) {
  const result = await client.post(`/api/refresh?${new URLSearchParams({ project })}`, { timeout: 300000, headers: { 'X-Release-Calendar': 'local' } }).json<unknown>();
  return z.object({ warnings: z.array(z.string()) }).parse(result);
}
export async function errorMessage(error: unknown): Promise<string> {
  const messages: Record<string, string> = {
    CODEX_CLI_MISSING: 'Codex CLI를 설치한 뒤 앱을 다시 시작하세요.',
    CODEX_MCP_CONFIG_UNSUPPORTED: 'Codex의 atlassian MCP가 비활성화됐거나 다른 주소를 사용합니다. 기존 설정을 확인하세요.',
    CODEX_RPC_FAILED: 'Codex의 Atlassian 연결을 확인하지 못했습니다. Codex 버전과 MCP 인증을 확인하세요.',
    CODEX_CONNECTION_FAILED: 'Codex 연결이 종료됐습니다. 다시 로그인하여 연결을 확인하세요.',
    CODEX_TIMEOUT: 'Codex 연결 확인 시간이 초과됐습니다. 잠시 후 다시 시도하세요.',
    CODEX_READ_FAILED: 'Codex는 연결됐지만 Jira 조회가 실패했습니다. 사이트 조회 권한을 확인하세요.',
    CODEX_RESPONSE_INVALID: 'Codex 응답 형식을 처리하지 못했습니다. 앱과 Codex 버전을 확인하세요.',
    GITHUB_CLI_MISSING: 'GitHub CLI(gh)를 설치한 뒤 앱을 다시 시작하세요.',
    GITHUB_LOGIN_FAILED: 'GitHub 인증을 완료하지 못했습니다. 브라우저 승인 상태를 확인하고 다시 로그인하세요.',
    OAUTH_REGISTRATION_FAILED: 'Atlassian 로그인 준비에 실패했습니다. 네트워크 연결을 확인하고 다시 눌러 주세요.',
    MCP_CONNECTION_FAILED: 'Atlassian 연결을 확인하지 못했습니다. 다시 로그인하거나 잠시 후 재시도하세요.',
    MCP_READ_TOOL_UNAVAILABLE: '현재 Atlassian 연결에 필요한 조회 기능이 없습니다. 조회 권한과 조직 정책을 확인하세요.',
    MCP_TOOL_SCHEMA_UNSUPPORTED: 'Atlassian 조회 형식이 변경되었습니다. 기존 데이터는 유지됩니다.',
    MCP_READ_FAILED: 'Atlassian에서 조회를 완료하지 못했습니다. 권한과 연결 상태를 확인하세요.',
    OAUTH_APP_REQUIRED: '최초 앱 등록 정보를 설정해 주세요.', OAUTH_IN_PROGRESS: '진행 중인 로그인을 완료하거나 취소해 주세요.',
    OAUTH_CALLBACK_PORT_BUSY: '다른 창에서 로그인 중이거나 4318 포트를 사용 중입니다. 진행 중인 로그인을 마친 뒤 다시 시도하세요.',
    OAUTH_REAUTHORIZE: '로그인이 만료되거나 해제됐습니다. 로그인 버튼으로 다시 연결하세요.', OAUTH_TOKEN_FAILED: '인증에 실패했습니다. 앱 등록 정보와 승인을 확인하고 다시 로그인하세요.',
    OAUTH_DISCOVERY_FAILED: '대상 목록을 읽지 못했습니다. 승인 범위·앱 설치·조회 권한을 확인하고 다시 시도하세요.',
    OAUTH_APP_REQUIRES_READ_ONLY: 'GitHub App에 쓰기 권한이 있습니다. 앱의 권한을 읽기 전용으로 변경해 주세요.',
    OAUTH_BUSY: '다른 창에서 인증정보를 갱신 중입니다. 잠시 후 다시 시도하세요.',
    SETTINGS_CHANGED_RELOAD: '다른 화면에서 설정이 바뀌었습니다. 설정 다시 불러오기를 누른 뒤 다시 시도하세요.',
    SETTINGS_BUSY: '다른 화면에서 저장 중입니다. 잠시 후 다시 시도하세요.',
    CREDENTIAL_MISSING: 'Jira 이메일과 API 토큰을 입력해 주세요.', GITHUB_CREDENTIAL_MISSING: 'GitHub 토큰을 입력해 주세요.',
    NEW_JIRA_CREDENTIALS_REQUIRED: 'Jira 사이트 또는 Cloud ID를 변경하면 이메일과 토큰을 다시 입력해야 합니다.',
    CONNECTION_ALREADY_EXISTS: '이미 사용 중인 연결 ID입니다. 기존 연결을 선택해 수정하세요.',
    SETTINGS_TOKEN_REQUIRED: '서버가 다시 시작됐습니다. 페이지를 새로고침해 주세요.',
    INPUT_INVALID: '필수 항목과 사이트·프로젝트·저장소 형식을 확인해 주세요.',
    HTTP_401: '인증정보가 올바르지 않거나 만료됐습니다.', HTTP_403: '조회 권한 또는 조직의 승인을 확인해 주세요.',
    HTTP_404: '사이트·프로젝트·저장소 주소와 접근 권한을 확인해 주세요.', HTTP_429: '조회 한도에 도달했습니다. 잠시 후 다시 시도하세요.',
  };
  if (error instanceof HTTPError) {
    const parsed = z.object({ error: z.string() }).safeParse(error.data);
    if (parsed.success) return messages[parsed.data.error] ?? '설정을 처리하지 못했습니다. 입력 내용과 로컬 파일 권한을 확인해 주세요.';
  }
  if (error instanceof z.ZodError) return '입력 형식이 올바르지 않습니다. Jira 사이트·프로젝트 키·저장소와 일정 규칙을 확인해 주세요.';
  return '서버 연결이 끊겼거나 요청 시간이 초과됐습니다. 저장 여부를 다시 불러와 확인해 주세요.';
}
export function probeMessage(code: string) {
  const values: Record<string, string> = { READ_ACCESS_CONFIRMED: '조회 연결 확인', NOT_CONFIGURED: '연결하지 않음', HTTP_401: '토큰·이메일 확인 필요', HTTP_403: '조회 권한·조직 승인 필요', HTTP_404: '주소 또는 접근 권한 확인 필요', HTTP_429: '조회 한도 초과', CREDENTIAL_MISSING: '인증정보 필요', TIMEOUT: '응답 시간 초과', NETWORK_ERROR: '네트워크 연결 실패' };
  return values[code] ?? '응답 확인 실패';
}
