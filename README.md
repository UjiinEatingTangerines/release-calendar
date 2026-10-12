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

연결 대상에 대한 버전·티켓·댓글·브랜치·PR 생성/수정, 상태 변경, 머지, 배포 실행은 제공하지 않습니다. 외부 HTTP 계층에는 허용된 조회 경로의 **GET만** 있습니다. UI·CLI·공통 API가 이 계층을 공유합니다.

로컬 설정, 캐시, 관측 스냅샷, 마지막 조회 시각 저장은 허용된 앱 내부 쓰기입니다. `POST /api/refresh`는 로컬 캐시 갱신이며 외부에는 GET만 보냅니다. 원본 수정은 링크로 이동한 Jira·GitHub에서 사용자가 직접 수행합니다.

## 실제 연동

웹 상단 **연결 설정**, 또는 메뉴 막대 앱의 톱니바퀴 → **연결 설정…**을 누르세요. 두 화면은 같은 로컬 설정을 사용합니다. 터미널에서 JSON을 편집할 필요가 없습니다.

1. 연결 이름·시간대, Jira 사이트·프로젝트 키를 입력합니다.
2. **Jira API 토큰 발급**을 눌러 발급한 토큰과 해당 계정 이메일을 입력합니다. 범위 지정 토큰은 Cloud ID도 입력합니다.
3. GitHub를 사용할 경우 저장소와 조회용 토큰을 입력합니다. 여러 저장소를 한 줄에 하나씩 넣을 수 있습니다.
4. **연결 확인**으로 접근 여부를 확인하고 **저장하고 동기화**를 누릅니다. 저장 이후 조회가 실패해도 설정은 남으며 실패 안내가 표시됩니다.

토큰 발급·조직 승인은 서비스에서 사용자가 수행합니다. OAuth 자동 로그인은 제공하지 않으며 기존 gh 로그인이나 다른 앱의 Jira 인증을 가져오지 않습니다. 저장한 이메일·토큰은 다시 화면에 내려보내지 않고, 수정 시 비워두면 유지합니다. Jira 사이트나 Cloud ID를 바꾸면 인증정보를 다시 입력해야 합니다. **연결 해제**는 앱이 관리하는 로컬 연결·인증정보만 제거하며 원본·캐시는 변경하지 않습니다.

Jira는 프로젝트 Browse 및 티켓 조회 권한이 필요합니다. [API 토큰 공식 안내](https://support.atlassian.com/atlassian-account/docs/manage-api-tokens-for-your-atlassian-account/)에 따라 읽기 권한을 선택하세요. 범위 지정 토큰은 `https://api.atlassian.com/ex/jira/{cloudId}`를 사용합니다. [Cloud ID 확인 방법](https://support.atlassian.com/jira/kb/retrieve-my-atlassian-sites-cloud-id/)을 참고하세요. GitHub fine-grained 토큰에는 선택한 저장소의 **Metadata, Pull requests, Contents, Checks, Commit statuses: Read-only**를 사용합니다. [공식 권한 안내](https://docs.github.com/en/rest/authentication/permissions-required-for-fine-grained-personal-access-tokens)를 참고하세요. 관리자·쓰기 권한을 요구하지 않으며, 앱이 기존 토큰의 권한 자체를 축소하지는 않습니다.

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

Jira 일부 페이지 실패는 수집 전체를 실패로 처리하여 기존 릴리스·티켓을 유지합니다. GitHub 수집 실패는 이전 GitHub 데이터를 보존하고 Jira 데이터와 별도 갱신 시각·부분 실패를 표시합니다. 인증/조회 실패를 삭제로 처리하지 않습니다. 성공한 조회에서도 권한 변화로 항목이 사라질 수 있으므로 과거 스냅샷은 보존하며 영구 삭제 사실로 단정하지 않습니다. API 호출은 순차 처리, 15초 요청 제한, 429/502/503/504에 최대 2회 재시도입니다. 긴 rate-limit 대기는 실패와 재조회 안내로 넘깁니다.

GitHub 첫 수집은 지정 저장소의 PR을 전 페이지 읽기 때문에 큰 저장소에서는 오래 걸릴 수 있습니다. 관련 PR만 상세·커밋·HEAD의 최신 check runs/commit statuses를 조회합니다. GitHub PR commits API의 최대 **250개** 제한은 그대로 적용되며 해당 수에 도달하면 UI에 표시합니다. CI는 관측한 PR HEAD 기준이며 실제 운영 환경의 상태가 아닙니다.

## 로컬 데이터와 제거

- 기본 데이터: `~/.local/share/release-calendar/`
- 변경: `--data-dir <path>` 또는 `RELEASE_CALENDAR_DATA_DIR`
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

**실제 Jira/개인 GitHub 데이터 연동은 시험하지 않았습니다.** 데모, 가상 HTTP 응답 계약, 실제 로컬 서버·CLI·브라우저를 검증했습니다. 테스트용 실제 티켓·버전·PR은 만들지 않았습니다. Jira Data Center, GitHub Enterprise, MCP 서버, 반복 슬롯, 다중 사용자·외부 배포는 첫 버전 범위 밖입니다.

공식 API 근거: [Jira 프로젝트 버전](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-project-versions/), [Jira enhanced issue search](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-search/), [GitHub PR/commits](https://docs.github.com/en/rest/pulls/pulls), [GitHub checks](https://docs.github.com/en/rest/checks/runs), [GitHub commit statuses](https://docs.github.com/en/rest/commits/statuses), [Zod](https://zod.dev/api), [ky](https://github.com/sindresorhus/ky), [Hono Node.js](https://hono.dev/docs/getting-started/nodejs), [Vite](https://vite.dev/guide/).
