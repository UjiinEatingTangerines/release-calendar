# Architecture and read contract

```text
web/ (Korean DOM UI) ── localhost HTTP ─┐
                                     ├─ Runtime → Queries → dates/schedule
src/cli.ts (JSON / terminal) ──────────┘                 ↑
                                     Store ← sync ← Jira/GitHub GET readers
```

| Boundary | Ownership |
| --- | --- |
| `src/core/dates.ts` | Civil dates, timezone conversion, month grids, weekday offsets |
| `src/core/model.ts` | Validated provider-independent records and stable IDs |
| `src/core/schedule.ts` | Source/derived events and weekly overlap segments |
| `src/core/query.ts` | Status, calendar, release detail, per-release guide |
| `src/config.ts` | Validated local connection/rule configuration; env-name references |
| `src/connectors/` | Jira Cloud / GitHub.com endpoint schemas, complete pagination, read-only transport |
| `src/storage.ts`, `src/sync.ts` | Config-scoped atomic file transactions, change observations, provider failure isolation |
| `src/server.ts` | Loopback HTTP, same-origin checks, static UI, no provider mutations |
| `web/` | Reusable DOM primitives, calendar, detail, client schema parsing, locale dictionary |

The first version uses one atomic JSON state file per project configuration containing current records, changed snapshots, and freshness/failure metadata. A directory lock excludes concurrent sync writers. A temporary 0600 file is renamed atomically. Failed or incomplete Jira pagination never replaces the current snapshot. GitHub failure retains previous GitHub records and its own observation time. A crashed lock is not automatically stolen. The README explains recovery.

Snapshots are unbounded locally and rewritten as one file. For large histories, a database-backed Store can replace this boundary; first-version cost is proportional to accumulated history. Collection is sequential and not an atomic transaction at the SaaS provider. Duplicate or stalled pages are detected, but changes or permission differences between successful pages can still affect the observed view. No stronger historical completeness is claimed.

## HTTP v1 (local)

| Method/path | Parameters/result |
| --- | --- |
| GET `/api/projects` | Safe alias/name/timezone list and demo/live mode; no credential settings |
| GET `/api/status` | `project`; freshness, warnings, coverage, future-plan count |
| GET `/api/calendar` | `project`, `month=YYYY-MM`; calendar days, events, undated releases |
| GET `/api/release` | `project`, `id`; release, tickets, PRs, source events and app observations |
| GET `/api/guide` | `project`, optional `at`, optional `release`; same result as CLI |
| POST `/api/refresh` | `project`; requires `X-Release-Calendar: local`; only writes local state |

JSON dates are `YYYY-MM-DD` without UTC conversion. Instants are ISO timestamps. Events carry `kind`, `start`, `end`, `source` (`jira`/`rule`), `sourceDetail`, and stable release ID. App observations use `observedAt`, never an invented provider change timestamp. `productionDeployment` is always `unknown` because no deployment evidence connector exists.

Read APIs never implicitly sync. This makes CLI and UI use the same stored snapshot and calculation logic. A future MCP adapter can expose only Queries' read methods, using the same IDs, warnings, evidence and trust boundary. Other local Admin clients can use this API with same-origin hosting; broad CORS and unauthenticated public exposure are intentionally absent.

The source provider text is inert data: Jira bodies/comments are not fetched; PR bodies are transiently inspected for exact keys and are not persisted. Summaries/titles remain untrusted text, rendered with `textContent`. Links are parsed as HTTPS. Authentication exists only in server-side HttpReader construction and env lookup, never in browser bundles or JSON. Errors are stable codes, not raw provider bodies or URLs with credentials.

## Extending connectors

Add a new collector producing the existing validated Release/Ticket/Pull records with provider-scoped stable IDs, explicit coverage and link evidence. Keep GET endpoint allowlists and parsing at the connector boundary. Do not add source mutations to Runtime or Queries. Jira Data Center and GitHub Enterprise require separate host/auth/API contracts; the Cloud/com allowlists must not be relaxed implicitly.

## Native macOS companion

`desktop/` contains an AppKit status item, SwiftUI popover, typed HTTP decoding and a Process owner. `src/desktop.ts` launches the same Hono app on an OS-assigned loopback port and loads local desktop credentials only for configured env names. An inherited stdin pipe establishes ownership: EOF/termination shuts down that app's server. The native wrapper never owns CLI-launched servers. SwiftUI cards consume `/api/menu`, which derives phases/deadlines from `Queries.guide`; there is no separate schedule engine. Web links carry validated project/release/month parameters. `scripts/build-macos.mjs` bundles server/web into an ad-hoc signed `.app`, referring to the machine's existing Node.js installation.
