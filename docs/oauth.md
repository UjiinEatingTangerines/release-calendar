# 브라우저 로그인 연결

웹·메뉴 막대 앱 모두 설정의 **Jira 로그인 / GitHub 로그인**을 사용합니다. 기본 브라우저에서 로그인·조회 권한을 승인하고 설정 창으로 돌아오면 사이트·프로젝트·저장소를 목록에서 선택할 수 있습니다. 비밀번호나 사용자 API 토큰은 앱에 입력하지 않습니다. 기존 로그인은 **로그인 사용**으로 다시 선택하고, 만료된 인증은 가능한 경우 자동 갱신합니다.

## Jira Cloud: 입력 없는 브라우저 로그인

1. **Jira 로그인**을 누릅니다. 앱이 공식 Atlassian MCP에 공개 OAuth 클라이언트를 자동 등록합니다. Client ID·secret을 입력하지 않습니다.
2. 기본 브라우저에서 계정과 사이트를 확인하고 조회 권한을 승인합니다.
3. 설정 창으로 돌아와 **로그인 사용** 또는 자동으로 표시된 사이트·프로젝트 목록을 선택합니다.
4. **선택한 대상으로 연결**을 누르면 실제 릴리스와 티켓을 조회합니다.

앱에 저장된 로그인은 재사용하며, 갱신 토큰이 있으면 자동 갱신합니다. 최초 동의와 만료 후 재승인은 사용자가 브라우저에서 수행합니다. Codex/Claude의 MCP 토큰이나 브라우저 쿠키를 추출하지 않으며 다른 앱의 인증 상태를 바꾸지 않습니다. 기존에 저장한 3LO 연결은 유지됩니다.

공식 MCP의 동적 클라이언트 등록과 authorization-code + PKCE S256을 사용합니다. 요청 범위는 `read:jira:agent-interface search:jira:agent-interface offline_access`입니다. 조직의 앱 허용 정책과 조회 권한이 적용됩니다. 이 경로는 REST API용 토큰으로 가장하지 않고 MCP 읽기 도구로 조회합니다. [인증 안내](https://developer.atlassian.com/cloud/rovo-mcp/guides/authentication-and-authorization/)와 [지원 도구](https://developer.atlassian.com/cloud/rovo-mcp/guides/supported-tools/)를 참고하세요.

## GitHub.com: 기존 앱 소유자 등록 방식

1. [GitHub App 등록](https://github.com/settings/apps/new)에서 개인 계정 소유의 앱을 생성합니다. 일반 OAuth App이 아닌 **GitHub App**입니다.
2. callback을 `http://127.0.0.1:4318/callback/github`로 등록하고 Webhook을 끕니다.
3. Repository permissions의 Metadata, Contents, Pull requests, Checks, Commit statuses만 **Read-only**로 설정합니다. 쓰기 권한을 넣지 마세요.
4. 앱에서 Client secret을 생성하고 Client ID와 함께 로컬 설정에 저장합니다.
5. **Install App**에서 사용할 계정·저장소에 설치한 뒤 **GitHub 로그인**을 누릅니다. 조직 설치는 관리자 승인이 필요할 수 있습니다.

GitHub App 사용자 토큰은 앱과 사용자 양쪽이 접근 가능한 저장소를 조회합니다. 설치된 저장소를 페이지 끝까지 읽고, 설치에 쓰기 권한이 있으면 연결 대상 선택을 거부합니다. 로그인은 state 및 PKCE S256을 사용하는 authorization-code 방식입니다. [공식 인증 안내](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app)를 참고하세요.

## 로컬 처리와 제한

- 앱 소유자 정보·액세스/갱신 토큰은 `~/.config/release-calendar/connections.json.oauth.json`에 0600으로 저장합니다. 암호화·Keychain 저장은 제공하지 않습니다. 사용자 지정 설정은 기존 관리 파일 뒤에 `.oauth.json`을 붙인 경로를 사용합니다.
- 브라우저와 앱에는 상태와 로컬 인증 식별자만 내려보냅니다. 저장된 토큰이나 client secret은 반환하지 않습니다. 앱·웹·CLI가 같은 인증 저장소를 읽습니다.
- 로그인할 때만 `127.0.0.1:4318` 콜백 서버를 열며 완료·거부·취소·10분 만료·앱 종료 시 닫습니다. 웹 달력 서버의 포트와는 별개입니다. 다른 창/프로그램이 사용 중이면 안내 후 중단합니다.
- 외부 POST는 인증 등록·교환·갱신과 MCP 프로토콜 전송에 사용합니다. MCP 호출은 `getAccessibleAtlassianResources`, `listJiraProjects`, `getJiraProjectVersions`, `searchJiraIssuesUsingJql`로 제한합니다. 그 밖의 도구와 쓰기·삭제 호출은 전송 전에 거부합니다. 기존 REST/GitHub 조회는 GET입니다.
- **로컬 로그아웃**는 로컬 토큰만 삭제합니다. 기존 연결을 복구할 수 있도록 비밀이 아닌 로컬 인증 ID는 남깁니다. **다시 인증**은 같은 ID에 새 토큰을 저장하여 기존 연결과 캐시를 유지합니다. 제공자에서 앱 승인을 철회하거나 앱을 삭제하는 작업은 각 서비스에서 직접 합니다. **연결 해제**와 OAuth 로그인 삭제는 별도입니다. 전체 로컬 인증을 제거하려면 OAuth 파일과 기존 credentials.json·환경변수도 확인하세요.
- 앱 등록 정보를 바꾸면 해당 제공자의 기존 토큰을 제거하고 다시 인증 상태로 표시합니다. 로그인 갱신은 파일 잠금 안에서 처리하여 여러 프로세스가 같은 회전형 갱신 토큰을 동시에 소비하지 않게 합니다. 갱신 실패 시 원본 캐시를 삭제하지 않습니다.
- 개인 소유·단일 사용자 로컬 운영을 대상으로 합니다. Jira MCP 공개 클라이언트에는 번들 비밀키나 중계 서버가 필요하지 않습니다. 기존 3LO·GitHub App의 비밀키도 공개 저장소나 번들에 포함하지 않습니다. 외부 호스팅은 생성하지 않았습니다.
- 실제 제공자 로그인은 등록된 앱과 사용자의 승인이 있어야 확인할 수 있습니다. 가상 인증 응답을 이용한 검증과 실제 계정 인증을 구분합니다.
