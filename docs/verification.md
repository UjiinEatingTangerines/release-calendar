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
