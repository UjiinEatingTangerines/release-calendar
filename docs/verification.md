# Verification

The implementation is tested without importing any real Jira/GitHub project data. Provider tests intercept the HTTP transport with fictional JSON responses; they are contract tests, not proof of live-service compatibility.

## Reproduce

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm test:browser
```

`pnpm test` builds before testing the real CLI. Browser QA launches a temporary loopback server and dedicated Chrome instance, closes both in `finally`, and writes ignored artifacts under `artifacts/`. No normal browser profile is used. Screenshots and raw research logs are not included in the public repository.

## Automated coverage

| Area | Evidence |
| --- | --- |
| 28/29/30/31 days, Monday-first boundaries, year crossing | `tests/calendar.test.ts`: independent Gregorian boundaries |
| Week/month continuation and overlapping lanes | Independent expected start/span/lane and continuation flags |
| Undated tickets/releases | No inferred ticket duration; separate undated list |
| Date-only and timezone behavior | Leap day, Seoul/Los Angeles midnight, mapped datetime vs date |
| Per-release guide and historical evaluation | Different phases for overlapping releases, latest snapshot timestamp preserved |
| No completion inference | Elapsed scheduled date leaves Jira Released false and deployment unknown |
| Empty/stale data | Empty availability and history, no future plan count, stale warning |
| Pagination and rate limits | Jira version/issue pages, GitHub PR/commit/check pages, GET retries for 429 |
| Authentication and partial failure | Redacted 401, failed later Jira page retains snapshot, GitHub failure separate |
| Snapshots | Changed dates retained, identical reruns deduplicated, config isolation, file mode |
| Read-only transport | All recorded provider calls GET; forbidden endpoint rejected before request |
| UI/CLI consistency | Actual compiled CLI output equals HTTP calendar API for fixed demo clock |
| Local server boundary | Host/Origin rejection, refresh guard, mutation route rejection, no credential response |

## Browser evidence

`scripts/browser-qa.mjs` verifies month navigation, 35→28→35 cells, arrow/Home keyboard focus, ticket/PR detail, source links, release filter, optional ticket dates, undated release, unrestricted old month, Today, refresh, and retaining the correct previous month after a failed request. The screenshot matrix covers 1440px desktop and 390px small screen under both light and dark OS preference; the product intentionally keeps its light theme.

The completed browser run passed all eight scenario groups with no page errors and zero axe violations on desktop/mobile, including the optional visible-label/accessible-name rule. The screenshots were visually inspected for readable Korean labels, continuous periods, detail layout and overflow. An initially cramped mobile filter and date-label mismatch were corrected and recaptured. This is not a claim of full screen-reader certification.

The type check and 36 unit/contract/surface tests passed. A real compiled CLI run in live mode with missing credentials returned exit 2, `dataAsOf: null`, and missing-credential/missing-snapshot warnings. `pnpm audit --prod` found no known vulnerabilities at verification time.

Lighthouse ran through a Playwright-owned Chrome instance using the Node API, three mobile and three desktop runs. After compression and CSP-compatible schema parsing, all four category scores reached 100 on both profiles. Raw reports are ignored under `artifacts/lighthouse-*.json`. These local measurements do not cover remote hosting or large live datasets.

## Unverified / limits

- No real Jira Cloud site or user GitHub repository was connected. API schemas/pagination were checked against official documentation and fictional HTTP fixtures only.
- No real tickets, versions, PRs or deployments were created for tests.
- Provider permissions, scoped-token setup, rate-limit policies and larger data sizes still need verification in the user's own environment.
- No provider change-history reconstruction, generated recurring slots, sub-day calendar, deployment evidence, multi-user authentication, Data Center, Enterprise, or MCP server.
- Browser artifacts are local evidence, not committed proof; rerun the scripts on a checkout to reproduce.

## macOS companion and popover (0.2)

- `pnpm check`, `pnpm test`: 46 tests including menu/guide phase consistency, civil-date countdowns, overdue/undated releases, empty/stale data, independent ephemeral servers, ownership-pipe shutdown, valid private credential loading, unsafe credential permission rejection, redaction and invalid-config failure.
- `pnpm desktop:build`: Swift 6 native executable and local `.app` built successfully on Apple Silicon; packaged server and web have no checkout dependency, but require the build machine's installed Node.js.
- `node scripts/native-qa.mjs`: actual AppKit application loads, opens/closes NSPopover, switches projects including an empty one, preserves cache on missing-credential refresh, constructs project/release web links, restarts and closes its owned servers on quit. Fixtures and cache are isolated temporary files; no live-provider calls.
- `node scripts/desktop-web-qa.mjs`: owned Chrome opens the menu deep link, selects the nondefault project, month and release and displays two expected tickets. Browser and test server close in `finally`.
- `pnpm test:browser`: existing eight web scenario groups still pass, with zero axe violations and page errors.
- `scripts/render-menu.swift`: the same production SwiftUI content is rendered through NSHostingView (not a HTML imitation) into light/dark, reduced-height and empty/error PNGs. Header/footer stay fixed while the list scrolls. The parent directly inspected these artifacts. OS screen capture and outside accessibility automation were unavailable; native harness actions and app-owned view snapshots were used instead. User confirmed that the original menu bar icon appeared; this is not a claim of full VoiceOver or external mouse/keyboard automation coverage.
- No real Jira/GitHub connection, Intel build, notarized distribution, auto-update or login-item verification was performed. The earlier Lighthouse results describe the web calendar, not the native popover.

Artifacts remain in ignored `artifacts/`: `native-qa.json`, `desktop-web-qa.json`, `menu-web-link.png`, `menu-light.png`, `menu-dark.png`, `menu-small.png`, `menu-empty.png`. Rebuild the app before native QA. Reproduce native snapshots by compiling `desktop/Models.swift`, `desktop/Tokens.swift`, `desktop/PopoverView.swift`, `scripts/render-menu.swift` with Swift 6 and passing a directory containing a fictional `/api/menu` response as `menu-api.json`.

## Shared connection settings

- `pnpm check` and 54 unit/contract/CLI tests pass. New tests cover private atomic save, credential omission from responses, blank-secret preservation, stale editor rejection, site-change credential requirements, local removal, CSRF/Origin/body-size guards, independent probe outcomes, and a compiled CLI process reading UI-managed settings.
- `pnpm test:settings`: five browser scenario groups pass. The real settings form validates missing credentials, checks a fictional provider response, saves/reloads a private local document, preserves blank credentials, and disconnects. At 1120px/390px there is no horizontal overflow and axe reports zero violations. Provider probes and first-sync responses are fixtures, not real authentication.
- `node scripts/native-qa.mjs`: the production AppDelegate opens its actual WKWebView settings window, loads the shared form, shows empty credential fields, and reports missing credentials when the connection-check button is activated. The native restart/project-switch/cache-preservation scenarios still pass. The app-owned view snapshot is `artifacts/native-settings.png`; no external Accessibility or Screen Recording permissions were enabled.
- Existing eight calendar browser scenarios and the native-to-web deep-link scenario pass. These runs use owned browsers and isolated fictional settings; the browsers and temporary servers are closed afterward.
- An error-body handling defect discovered by native QA was fixed using Ky's pre-parsed `HTTPError.data`; the missing-credentials path was then rerun in both browser and WKWebView. A calendar run overlapping a web build was discarded and rerun after the build completed.
- Settings artifacts: `settings-qa.json`, `settings-desktop.png`, `settings-mobile.png`, `native-settings.png`, and the updated `native-qa.json`. They are excluded from Git. No actual Jira or GitHub credentials were used. Token issuance, organization approval, and live-service authentication remain unverified.

## Browser OAuth sign-in

- `pnpm check` and 81 tests pass. OAuth tests exercise the real loopback callback with fictional token HTTP responses: state mismatch, consent denial, cancellation (including an exchange already in flight), one-time code handling, credential redaction, private storage, serialized rotating-token refresh across two instances, provider pagination, read-only GitHub installation checks, CSRF guards, last-good schedule preservation after auth loss, and reauthorization retaining the ID used by existing projects.
- Jira's documented response can omit `token_type`; its contract fixture covers that shape. GitHub validates Bearer token type and uses S256 PKCE. These checks use the provider's documented contracts, not a live account.
- `pnpm test:oauth` drives Jira login without owner fields and GitHub device-code login without owner fields, opens fictional consent pages in owned browser tabs, returns through the actual callback listener, selects Jira site/project and a GitHub repository, saves an OAuth-backed connection, and reauthorizes that same grant. External provider transport and consent screens are fixtures. The settings API, state checks, callback HTTP, persistence and resource selection are real. First schedule sync is a fixture; existing provider collector tests cover that boundary separately.
- Desktop/mobile OAuth screenshots are `artifacts/oauth-desktop.png` and `oauth-mobile.png`; both have zero axe violations and no horizontal overflow. The parent inspected the captured layout. `oauth-qa.json` records the scenario result.
- Native QA opens the production WKWebView and checks both browser-login cards, empty secret fields, the advanced manual form and its missing-credential validation. Native external login/consent is not claimed as live-tested. The existing popover/restart/ownership scenarios pass.
- The calendar's eight browser scenarios and manual settings' five scenario groups still pass. All task-owned automated browsers and temporary callback servers close after each run.
- Live Atlassian public-client registration succeeded without a client secret. The browser consent screen was opened; completion and real project data retrieval are not claimed until separately verified. GitHub now uses the installed CLI browser flow; its real device-code issuance and cancellation were verified without completing user consent. No hosting or authentication relay was deployed.
- MCP contract tests cover public client metadata, PKCE code exchange, token redaction and restart reuse, paginated tool discovery/projects, read-tool rejection before network access, provider-error redaction, and released/archived/future/undated versions through the existing Jira collector. Fixtures use fictional data and do not prove compatibility with every live server response shape.

- GitHub subprocess tests use executable fixtures to assert isolated configuration, exact login arguments, absent inherited tokens, completion, cancellation, token redaction, restart reuse, GET-only repository pagination and rejection of tokens arriving after cancellation. A real installed `gh` generated a device verification code and was cancelled with cleanup; actual user consent and private repository access remain unverified. Native QA checks both cards contain no client-credential inputs.

- `node scripts/github-shutdown-qa.mjs` starts the packaged desktop backend, issues a real gh device code without completing consent, closes the owned stdin pipe, and verifies both child-process exit and temporary credential-directory removal. The normal gh active account stayed unchanged.

## MCP v2 and automatic sync correction

The legacy v1 OAuth issuer produced tokens rejected by MCP v2. New connections now use Atlassian's v2 authorization server and a public CIMD document. Legacy grants require explicit browser reauthorization; no other application's tokens are copied. `pnpm check` and 89 tests pass. Contract tests cover migration warnings, PKCE/token resource binding, v2 data envelopes, paginated collection, startup/periodic sync, concurrent manual refresh deduplication, timer failure/retry/stop, and shutdown cancellation. Tests isolate demo mode even when real local connections exist.

Web OAuth (fictional consent), calendar desktop/mobile accessibility, and native app scenarios passed. `node scripts/auto-sync-qa.mjs` verifies that new local snapshot data appears without clicking refresh, keyboard focus survives polling, and polling never invokes the provider refresh endpoint. Real Jira v2 consent and release collection require the user's approval and are not established by these fixture tests.
