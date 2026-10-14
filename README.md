# Release Calendar

macOS 메뉴 막대 앱도 제공합니다. `pnpm desktop:build` 후 `pnpm desktop`으로 실행하면 가까운 일정과 동기화 상태를 확인하고, 상세 웹 달력을 열 수 있습니다. 서버는 앱이 자동 관리합니다. [설치·로컬 연동 설정 안내](docs/macos.md)를 참고하세요.


Jira Releases를 기준으로 릴리스 일정과 포함 티켓을 월간 달력에서 읽고, 같은 데이터를 CLI로 조회하는 단일 사용자용 로컬 앱입니다. 첫 지원 대상은 **Jira Cloud와 GitHub.com**입니다.

## 빠른 시작

Node.js 22.12 이상과 pnpm 10 이상이 필요합니다. 데모는 계정·토큰 없이 실행됩니다.

```sh
git clone https://github.com/UjiinEatingTangerines/release-calendar.git
cd release-calendar
pnpm install --frozen-lockfile
pnpm build
pnpm start
```

브라우저에서 <http://127.0.0.1:4317>을 여세요. 서버를 종료하려면 실행한 터미널에서 `Ctrl+C`를 누릅니다. 다른 포트는 `pnpm cli serve --demo --port 4320`으로 지정합니다. 외부 호스팅이나 유료 자원을 생성하지 않습니다.

데모는 실행 시점의 현재 월을 기준으로 생성되며 `example.com` 원문 링크와 가상 프로젝트·티켓만 사용합니다. 반복 가능한 예시는 `--demo --demo-at 2027-03-10`으로 고정합니다. 데모의 새로고침은 가상 데이터를 다시 생성하며 실제 관측 이력을 저장하지 않습니다.

## 화면

- 월요일부터 일요일까지 모든 주와 월 경계, 이전·다음·오늘·직접 월 선택
- 여러 릴리스의 주간 연속 기간 막대, 기능 마감·QA 예상 일정, Jira 배포일
- 프로젝트·릴리스 필터, 선택적 티켓 일정, 겹침 더보기, 배포일 미정 목록
- 같은 화면의 릴리스·티켓·PR·커밋·검사 결과·연결 근거·원문·관측 이력
- 작은 화면의 월간 개요와 선택일 일정, 날짜의 방향키·Home·End 탐색
- 데이터 갱신 시각·경고와 마지막 정상 데이터 보존

개별 날짜가 없는 티켓은 상세의 **개별 일정 없음**에 표시합니다. 릴리스 기간을 티켓의 확정 일정으로 복사하지 않습니다. Jira Released, 티켓 완료, PR 머지, CI 결과는 각각 표시하며 **운영 배포 성공은 알 수 없음**입니다. 날짜가 지났다는 이유로 완료 처리하지 않습니다.

## 읽기 전용 계약

연결 대상에 대한 버전·티켓·댓글·브랜치·PR 생성/수정, 상태 변경, 머지, 배포 실행은 제공하지 않습니다. REST 연결은 허용된 조회 경로의 GET만 사용합니다. Jira 브라우저 연결은 공식 Atlassian MCP의 허용된 읽기 도구만 호출합니다. MCP 조회 전송과 인증 코드 교환·갱신에는 POST가 사용되지만 업무 데이터 변경은 허용하지 않습니다. UI·CLI·공통 API가 이 계층을 공유합니다.

로컬 설정, 캐시, 관측 스냅샷, 마지막 조회 시각 저장은 허용된 앱 내부 쓰기입니다. `POST /api/refresh`는 로컬 캐시 갱신이며 업무 데이터는 GET으로 조회하며 필요하면 OAuth 토큰을 갱신합니다. 원본 수정은 링크로 이동한 Jira·GitHub에서 사용자가 직접 수행합니다.

## 실제 연동

웹 상단 **연결 설정**, 또는 메뉴 막대 앱의 톱니바퀴 → **연결 설정…**을 누르세요. 두 화면은 같은 로컬 설정을 사용합니다. 터미널에서 JSON을 편집할 필요가 없습니다.

1. **Jira 로그인 / GitHub 로그인**을 눌러 기본 브라우저에서 로그인·조회 권한을 승인합니다.
2. 설정 화면으로 돌아와 접근 가능한 Jira 사이트·프로젝트와 GitHub 저장소를 선택합니다.
3. **선택한 대상으로 연결**을 누르면 저장 후 첫 일정을 동기화합니다. 앱·웹·CLI가 같은 로컬 인증을 사용합니다.

**Jira는 Codex의 Atlassian 인증을 재사용합니다.** Jira 로그인 버튼은 실제 조회로 기존 인증을 확인하고, 인증이 없으면 Codex를 통해 브라우저 승인을 엽니다. 앱은 토큰을 복사하지 않고 Codex App Server의 읽기 도구만 호출합니다. Codex CLI 0.162.1에서 검증했으며 모델 실행은 사용하지 않습니다. 로컬 로그아웃은 앱 연결만 해제합니다. **GitHub도 Client ID·secret 입력 없이 브라우저에서 인증합니다.** 설치된 GitHub CLI(`gh`)로 일회용 코드를 발급받아 GitHub 화면에서 승인합니다. `gh`가 없으면 `brew install gh` 후 앱을 다시 실행하세요. GitHub CLI 승인 권한은 쓰기를 포함할 수 있지만 앱은 허용된 GET 조회만 수행합니다. 기존 터미널 계정 설정은 변경하지 않습니다. [제공자별 로그인 안내](docs/oauth.md)를 참고하세요.

기존 토큰 방식은 **저장된 연결 관리 · 고급 수동 설정** 안에서 사용할 수 있습니다. 저장된 이메일·토큰은 다시 화면에 내려보내지 않고 수정 시 비워두면 유지합니다. OAuth 로그인 정보 삭제는 연결 해제와 별개이며 다른 연결에서도 같은 로그인을 사용할 수 있습니다.

연결 설정의 **일정 규칙**에서 릴리스 이름 필터·기능 마감·QA 오프셋을 설정할 수 있고 CLI용 프로젝트 ID를 확인할 수 있습니다. 여러 서비스는 연결을 나누고 이름 필터를 지정하세요. 등록한 설정은 앱·웹·CLI에 공유되며 일반 조회는 캐시를 읽습니다. 원본 조회는 저장 직후 또는 새로고침/`sync`로 실행합니다.

고급 설정은 [가상 설정 예제](examples/config.json)를 참고해 `~/.config/release-calendar/config.json` 또는 `--config <path>`로 지정할 수 있습니다. 인증은 설정의 환경변수 이름에 맞춰 주입하거나 같은 폴더의 소유자 전용 0600 `credentials.json`에 저장할 수 있습니다. UI에서 저장하면 관리 파일이 우선하며, 기존 설정·인증 파일은 자동 수정·삭제하지 않습니다. 임의 경로의 설정을 사용하면 그 경로의 `.connections.json` 보조 파일에 UI 설정을 저장합니다. 저장소 밖 경로를 사용하세요.

`--config` 없이 실행하면 저장한 로컬 연결을 사용하며, 연결이 없으면 데모입니다. 데모를 명시하려면 `--demo`를 사용하세요. `sync`는 경고가 있으면 종료 코드 2, 입력/실행 오류는 1, 정상은 0입니다. 실제 계정 연결은 직접 검증하지 않았습니다.

## CLI와 AI

빌드 후 `pnpm cli` 또는 `node dist/cli.js`로 실행합니다. `release-calendar` 이름으로 PATH에 설치하려면 원하는 경우 `pnpm link --global`을 실행하세요.

```sh
pnpm cli status --demo --project demo --json
pnpm cli calendar --project demo --month 2027-03 --demo --demo-at 2027-03-10 --json
pnpm cli guide --project demo --at 2027-03-10 --demo --demo-at 2027-03-10 --json
pnpm cli release 'jira:https://fictional-orbit.atlassian.net:100:1' --project demo --demo --demo-at 2027-03-10 --json
pnpm cli guide --project demo --at 2027-03-10 --release 'jira:https://fictional-orbit.atlassian.net:100:1' --demo --demo-at 2027-03-10 --json
```

`guide`에는 프로젝트·시간대·평가 날짜·릴리스별 단계·관측 상태·다음 마감·권장 작업·주의사항·근거 링크·데이터 기준 시각·부족한 정보가 있습니다. 릴리스가 겹치면 각각 반환합니다. 기본은 기준 날짜 이후의 릴리스와 날짜 미정 릴리스이며, 지난/보관 릴리스는 `--release`로 명시 조회할 수 있습니다.

`--at`은 일정상 단계를 계산할 날짜입니다. **데이터는 최신 정상 스냅샷**이며 `dataAsOf`가 별도로 표시됩니다. 과거 `--at`으로 당시 알려진 상태를 복원하지 않습니다. 권장 작업은 참고이며 권한·코드 준비·배포 성공의 증명이 아닙니다. [Codex와 Claude Code 예시](docs/ai-guide.md)를 참고하세요. 다른 저장소의 AGENTS.md·CLAUDE.md를 자동 변경하지 않습니다.

## 일정 규칙과 출처

Jira `startDate`/`releaseDate`는 날짜 그대로 유지합니다. 개발 기간 막대는 두 날짜 사이의 릴리스 작업 구간이며, Jira가 제공하지 않는 개발 완료 사실은 추정하지 않습니다. 기능 마감·QA는 `rules.featureFreeze` / `rules.qa`의 음수 오프셋으로 계산하고 **예상**으로 표시합니다.

- `basis: calendar`: 달력일, `basis: weekdays`: 월~금만 계산. 공휴일 달력은 지원하지 않습니다.
- QA 예상 구간은 QA 시작부터 배포 전날까지입니다. 시작과 배포일이 같으면 그날의 일정입니다.
- `ticketDates`는 사용자가 매핑한 `date` 또는 `datetime` 필드입니다. 시간 지정 값은 프로젝트의 IANA 시간대로 날짜를 계산합니다. 첫 UI는 월간 날짜 단위이며 시/분 시간표는 제공하지 않습니다.
- 존재하지 않는 날짜·시간대는 거부합니다. 원본의 역전된 시작/기한은 경고하며 잘못된 막대를 만들지 않습니다.
- 등록된 미래 Jira 릴리스와 그 파생 일정만 지원합니다. **예상 반복 슬롯 생성은 비활성이고 첫 버전에는 없습니다.**

## 이력과 실패 처리

첫 동기화는 조회 가능한 Released/Archived/Unreleased 버전과 버전에 연결된 티켓을 모든 페이지에서 읽습니다. 날짜 범위를 임의로 제한하지 않습니다. 제공자 권한·보존 정책에 의해 보이지 않는 데이터는 복원할 수 없습니다.

릴리스 ID는 Jira 사이트+프로젝트 ID+버전 ID, 티켓 ID는 사이트+이슈 ID이며 이름 변경에 의존하지 않습니다. GitHub 저장소 ID와 PR node ID, 커밋 SHA를 보존합니다. PR 연결은 이슈 키의 명시적 참조(제목·본문·브랜치)만 사용하고 근거 위치를 제공합니다. 제목 유사성은 사용하지 않습니다. 원격 링크 전용 연결이나 소문자 이슈 키 참조는 현재 수집하지 않습니다.

릴리스·티켓·PR 상태가 달라질 때만 스냅샷을 추가합니다. 변경 시각은 **앱 관측 시각**이며 제공자의 실제 변경 시각이 아닙니다. 현재 원본의 과거 릴리스 기록, 제공자의 변경 이력, 앱 관측 이력은 다릅니다. 첫 버전은 제공자 변경 이력 API나 과거 스냅샷 지정 조회를 제공하지 않습니다. 상세에서 보존한 관측 목록을 확인할 수 있습니다.

Jira 일부 페이지 실패는 수집 전체를 실패로 처리하여 기존 릴리스·티켓을 유지합니다. GitHub 수집 실패는 이전 GitHub 데이터를 보존하고 Jira 데이터와 별도 갱신 시각·부분 실패를 표시합니다. 인증/조회 실패를 삭제로 처리하지 않습니다. 성공한 조회에서도 권한 변화로 항목이 사라질 수 있으므로 과거 스냅샷은 보존하며 영구 삭제 사실로 단정하지 않습니다. REST API 호출은 순차 처리, 15초 요청 제한, 429/502/503/504에 최대 2회 재시도입니다. MCP 요청은 30초 제한을 적용하고 실패 시 마지막 정상 데이터를 유지합니다. 긴 rate-limit 대기는 실패와 재조회 안내로 넘깁니다.

GitHub 첫 수집은 지정 저장소의 PR을 전 페이지 읽기 때문에 큰 저장소에서는 오래 걸릴 수 있습니다. 관련 PR만 상세·커밋·HEAD의 최신 check runs/commit statuses를 조회합니다. GitHub PR commits API의 최대 **250개** 제한은 그대로 적용되며 해당 수에 도달하면 UI에 표시합니다. CI는 관측한 PR HEAD 기준이며 실제 운영 환경의 상태가 아닙니다.

## 로컬 데이터와 제거

- 기본 데이터: `~/.local/share/release-calendar/`
- 변경: `--data-dir <path>` 또는 `RELEASE_CALENDAR_DATA_DIR`
- OAuth 앱 등록 정보·로그인 토큰: `~/.config/release-calendar/connections.json.oauth.json` (0600, 평문). [삭제와 인증 제한](docs/oauth.md)을 참고하세요.
- 화면에서 저장한 연결·인증정보: `~/.config/release-calendar/connections.json` (0600, 평문). 앱·웹·CLI가 공유합니다.
- 고급 설정: `--config <path>` 또는 기본 `~/.config/release-calendar/config.json`. 명시한 경로의 UI 설정은 `<path>.connections.json`에 저장됩니다. 관리 파일이 기존 JSON보다 우선합니다.
- 이전 방식의 `credentials.json`은 이관 후에도 남습니다. 완전히 제거하려면 기존 파일과 환경변수도 직접 정리하세요.
- 프로젝트 설정의 해시별로 캐시를 분리하여 연결/규칙 변경 후 예전 데이터를 새 설정으로 오해하지 않습니다.
- 파일은 0600, 새 데이터 디렉터리는 0700으로 생성합니다. 암호화 저장은 제공하지 않으므로 OS 계정과 디스크 보호를 사용하세요.

앱을 종료한 뒤 **직접 지정한 데이터 디렉터리**와 설정 파일을 삭제하면 이 앱의 로컬 기록이 제거됩니다. 기본 경로라면 `rm -r "$HOME/.local/share/release-calendar"`를 사용할 수 있습니다. 이 작업은 되돌릴 수 없으며 Jira·GitHub 원본에는 영향이 없습니다. 비정상 종료로 `.lock` 디렉터리가 남았다면 동기화 프로세스가 없음을 확인하고 해당 잠금 디렉터리만 제거하세요. 토큰 폐기는 제공자에서 별도로 수행합니다.

`.env*`, 로컬 설정, 캐시, 스냅샷, 테스트 산출물은 `.gitignore`에 포함되어 있습니다. 저장소 밖 경로를 기본으로 사용합니다. 서버는 `127.0.0.1`에만 바인딩하며 원격 Host/Origin을 거부합니다. 인터넷 공개·공유 PC·다중 사용자용 인증 서비스가 아닙니다.

## 구조와 검증

Node.js LTS와 TypeScript를 선택해 서버·CLI·달력 모델을 공유하고 별도 DB 설치를 없앴습니다. Hono는 작은 로컬 API, Zod는 경계 검증, ky는 제한된 조회 통신, Vite는 작은 DOM 기반 UI 빌드에 사용합니다. 프런트엔드 프레임워크나 클라우드 서비스 없이 실행됩니다. TypeScript는 빌드 시 JS로 컴파일하여 사용자가 추가 TS 런타임을 설치할 필요가 없습니다.

```sh
pnpm check
pnpm test
pnpm test:browser
pnpm test:settings
```

브라우저 검증은 설치된 Chrome을 별도 자동화 프로필로 사용하고 `finally`에서 닫습니다. Chrome이 없으면 `pnpm exec playwright install chromium` 후 `QA_BROWSER_CHANNEL=chromium pnpm test:browser`를 사용하세요. 테스트 증거는 Git에서 제외된 `artifacts/`에 생성됩니다. [검증 결과와 한계](docs/verification.md), [구조/API 계약](docs/architecture.md)을 참고하세요.

**Codex 기존 인증을 이용한 실제 Jira 릴리스 조회와 연결된 GitHub 동기화를 검증했습니다. 신규 Codex 브라우저 승인은 가상 응답으로 검증했으며 실제 새 계정 승인은 별도 확인이 필요합니다.** 데모, 가상 HTTP 응답 계약, 실제 로컬 서버·CLI·브라우저를 검증했습니다. 테스트용 실제 티켓·버전·PR은 만들지 않았습니다. Jira Data Center, GitHub Enterprise, MCP 서버, 반복 슬롯, 다중 사용자·외부 배포는 첫 버전 범위 밖입니다.

공식 API 근거: [Jira 프로젝트 버전](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-project-versions/), [Jira enhanced issue search](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-search/), [GitHub PR/commits](https://docs.github.com/en/rest/pulls/pulls), [GitHub checks](https://docs.github.com/en/rest/checks/runs), [GitHub commit statuses](https://docs.github.com/en/rest/commits/statuses), [Zod](https://zod.dev/api), [ky](https://github.com/sindresorhus/ky), [Hono Node.js](https://hono.dev/docs/getting-started/nodejs), [Vite](https://vite.dev/guide/).

### 자동 동기화

웹 서버와 메뉴 막대 앱은 시작 시, 그리고 조회가 끝난 뒤 5분마다 저장된 프로젝트를 동기화합니다. 앱/서버가 종료된 동안은 실행하지 않습니다. 수동 새로고침과 자동 조회는 같은 프로젝트·설정에서 진행 중인 요청을 공유합니다. 실패 시 마지막 정상 스냅샷을 유지하고 다음 주기에 다시 시도합니다. 웹은 15초마다 로컬 스냅샷을 확인하며 메뉴 막대는 60초마다 표시를 갱신합니다. CLI 조회 명령은 저장된 스냅샷만 읽고 `sync` 명령은 즉시 조회합니다.

기존 Jira MCP v1 로그인은 v2에 사용할 수 없습니다. 설정에서 **다시 로그인**하면 연결 ID를 유지한 채 인증을 교체합니다. 인증정보를 다른 앱에서 복사하지 않습니다. 공개 `oauth-client.json`에는 앱 이름과 localhost 콜백 주소만 있으며 사용자 데이터나 인증정보는 없습니다. 개발 포크는 자신의 공개 메타데이터 URL과 콜백 주소를 등록해야 합니다.

### 로컬 진단 로그

웹·메뉴 막대 앱·CLI는 `~/.local/state/release-calendar/diagnostics.jsonl`에 진단 이벤트를 기록합니다. 최대 1 MiB씩 현재 파일과 `.1`, `.2` 두 보관 파일을 유지하며 파일 권한은 0600입니다. 로그를 지우려면 앱을 종료한 뒤 이 세 파일을 삭제하세요.

동기화별 `traceId`, 프로젝트 식별자의 해시인 `projectRef`, 제공자, 단계, 소요 시간, 마지막 정상 데이터 보존 여부를 기록합니다. Codex 오류는 프로세스별 `sessionId`, RPC 요청 번호, 읽기 작업 이름과 오류 분류를 함께 남깁니다. `refresh_rejected`는 공급자가 갱신 요청을 거부했다는 뜻이고, `auth_required`는 재인증이 필요하다는 뜻입니다. 같은 `sessionId`의 `auth_error`와 `rpc_failed`, 같은 `traceId`의 `sync_failed`를 연결해 확인하세요.

토큰·쿠키·인증 URL·이메일·프로젝트 이름·티켓 내용·원문 오류·원문 표준 오류 출력은 저장하지 않습니다. 로그는 외부로 전송되지 않습니다. 갱신 거부를 확인할 수 있어도 공급자가 토큰을 무효화한 최초 이유까지 알 수 있는 것은 아닙니다. 개선 전 실패의 상세 로그를 소급 복원하지는 않습니다.

### 계획 기간

연결 설정 → 일정 규칙에서 시작일 기준 계획 일수를 지정할 수 있습니다. 예: `rules.planning: { "days": 3, "basis": "weekdays" }`. 시작일을 포함해 3평일을 계획으로 계산하고 다음 평일부터 개발을 표시합니다. 주말 시작은 다음 월요일부터 계산하며 공휴일은 반영하지 않습니다. 개발 기간은 프리즈 당일(포함), 프리즈가 없으면 QA 전날까지입니다. 날짜 막대는 주말을 가로질러 이어지지만 평일 규칙의 일수에는 주말을 포함하지 않습니다. 계획·개발 구분은 규칙으로 계산한 예상이며 Jira 원본 날짜나 티켓 일정을 바꾸지 않습니다. 계획이 프리즈를 넘는 모순된 설정은 단계를 `unknown`으로 표시합니다. 계획 일수가 없으면 계획 기간을 임의로 생성하지 않습니다.
