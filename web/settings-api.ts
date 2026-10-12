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
