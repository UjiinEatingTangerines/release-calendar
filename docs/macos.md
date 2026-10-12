# macOS 메뉴 막대 앱

메뉴 막대의 카드형 팝오버에서 가까운 릴리스·남은 날짜·일정상 단계·다음 마감·동기화 상태를 확인하고, 릴리스나 **전체 캘린더 열기**를 누르면 기본 브라우저에서 상세 내용을 봅니다. 프로젝트 선택은 웹 링크에도 반영됩니다. 미출시 릴리스는 예정일이 지나도 남아 있으며, 날짜 없는 릴리스도 표시합니다. 가까운 미래, 최근 예정일이 지난 미출시, 날짜 미등록 순으로 최대 6개를 보여주고 나머지는 전체 캘린더에서 확인합니다.

## 빌드와 실행

macOS, Node.js 22.12 이상, pnpm, Swift 6을 제공하는 Xcode Command Line Tools가 필요합니다.

```sh
pnpm install --frozen-lockfile
pnpm desktop:build
pnpm desktop
```

`desktop-build/Release Calendar.app`을 Finder에서 더블클릭할 수도 있습니다. 원하면 이 파일을 사용자의 `Applications` 폴더로 복사하세요. 앱 내부에 웹과 서버 코드는 포함되지만 Node.js 실행 파일은 포함하지 않습니다. 빌드 시 확인한 로컬 Node.js 경로를 사용하므로, Node.js를 이동/제거했다면 설치 후 다시 빌드해야 합니다. 빌드한 컴퓨터의 아키텍처용 로컬 앱이며 Developer ID 서명·공증·자동 업데이트·로그인 시 자동 시작은 제공하지 않습니다.

앱은 Dock에 창을 만들지 않고 달력 아이콘으로 나타납니다. 앱을 다시 열어도 기본 Launch Services 동작으로 기존 인스턴스를 사용합니다. `open -n`으로 강제 다중 실행하지 마세요.

## 데모와 실제 연동

`~/.config/release-calendar/config.json`이 없으면 데모입니다. 파일이 있으면 README의 공통 설정으로 실제 연동 모드를 사용합니다. 잘못된 설정은 데모로 조용히 대체하지 않고 시작 실패로 표시합니다. 하단 톱니바퀴의 **연동 설정 폴더 열기**에서 파일을 관리하고, 변경한 후 **설정 다시 읽기 / 서버 재시작**을 누르세요. `RELEASE_CALENDAR_CONFIG` 환경변수로 경로를 지정할 수도 있으나 Finder 실행에는 터미널 환경변수가 전달되지 않을 수 있습니다.

Finder 실행을 위한 선택적 인증 파일은 설정 파일과 같은 폴더의 `credentials.json`입니다. 키는 config.json의 `emailEnv`, `tokenEnv`에 설정한 환경변수 이름과 정확히 같아야 합니다. 기존 설정 예제 기준으로 다음 모양입니다. 실제 값은 로컬에서만 넣으세요.

```json
{
  "RELEASE_JIRA_EMAIL": "you@example.com",
  "RELEASE_JIRA_TOKEN": "replace-locally",
  "RELEASE_GITHUB_TOKEN": "replace-locally"
}
```

```sh
chmod 700 "$HOME/.config/release-calendar"
chmod 600 "$HOME/.config/release-calendar/config.json" "$HOME/.config/release-calendar/credentials.json"
```

인증 파일은 **암호화되지 않은 로컬 파일**입니다. 앱은 파일 소유자와 다른 사용자 접근 권한이 없는지 확인하고, 설정에 등록된 인증 키만 읽습니다. 키체인 저장 기능은 없습니다. 이 파일은 Git에서 제외하며 앱 번들에 복사하지 않습니다. 파일이 없으면 앱이 상속받은 환경변수를 사용하고, 둘 다 있으면 파일 값이 우선합니다. CLI는 기존처럼 환경변수를 사용하며 credentials.json을 자동으로 읽지 않습니다. 실제 값이 없는 상태에서는 새로고침 시 경고를 표시합니다. 토큰을 채팅이나 공개 저장소에 붙이지 마세요.

앱 시작과 60초 간격 갱신은 **로컬 캐시 조회**입니다. Jira/GitHub 조회는 메뉴의 **지금 새로고침** 또는 웹 새로고침으로 실행합니다. 메뉴와 웹·CLI는 같은 설정의 캐시와 Queries 로직을 공유합니다. 시간대는 프로젝트 설정을 사용하며, 기간 계산만으로 출시나 운영 배포를 완료 처리하지 않습니다.

## 서버와 종료

앱은 `127.0.0.1`의 비어 있는 포트를 자동으로 배정받습니다. CLI 서버의 4317 포트나 다른 프로그램을 점유하거나 종료하지 않습니다. 웹 주소는 앱을 재시작하면 바뀔 수 있으므로 메뉴에서 여세요. 앱을 종료하면 열린 웹 탭은 남지만 해당 서버는 종료됩니다.

하단 톱니바퀴의 **Release Calendar 종료**로 종료하면 앱 소유 서버도 종료됩니다. 앱이 강제 종료돼도 부모 파이프가 닫히면서 서버가 종료됩니다. 서버가 비정상 종료되면 메뉴에 오류가 나타나고 재시작할 수 있습니다. 설정을 제거하려면 로컬 config.json/credentials.json을 삭제하고 앱을 재시작하세요. 캐시 제거는 README의 로컬 데이터 안내를 따릅니다.

## 구현 근거

macOS 기본 [NSStatusBar](https://developer.apple.com/documentation/appkit/nsstatusbar)와 [Process](https://developer.apple.com/documentation/foundation/process)를 사용합니다. 웹 열기는 [NSWorkspace](https://developer.apple.com/documentation/appkit/nsworkspace/open(_:)), 서버 번들은 [esbuild](https://esbuild.github.io/api/#bundle)를 사용합니다. 별도의 브라우저 엔진을 앱에 포함하지 않아 기존 로컬 웹과 CLI 구조를 유지합니다.

팝오버는 라이트·다크 모드를 따릅니다. 파란 개발, 보라 QA, 주황 마감, 초록 계획, 빨간 예정일 경과 뱃지를 사용하며 텍스트로도 상태를 표시합니다. 릴리스 목록만 스크롤하고 웹 열기와 새로고침은 하단에 유지됩니다. OpenUsage·CodexBar의 공개 UI에서 정보 위계를 참고했으며 코드를 복사하지 않았습니다. 상세 출처는 DESIGN.md에 기록했습니다.
