# Architecture and read contract

```text
web/ (Korean DOM UI) ── localhost HTTP ─┐
                                     ├─ Runtime → Queries → dates/schedule
src/cli.ts (JSON / terminal) ──────────┘                 ↑
                                     Store ← sync ← Jira MCP/REST and GitHub GET readers
```

| Boundary | Ownership |
| --- | --- |
| `src/core/dates.ts` | Civil dates, timezone conversion, month grids, weekday offsets |
| `src/core/model.ts` | Validated provider-independent records and stable IDs |
| `src/core/schedule.ts` | Source/derived events and weekly overlap segments |
| `src/core/query.ts` | Status, calendar, release detail, per-release guide |
| `src/settings/` | Local atomic connection/credential storage, revision conflict checks, read-only connection probes |
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
| GET `/api/settings` | Editable settings and credential presence only; local write CSRF token |
| POST `/api/settings/check` | Validate a draft with GET-only provider probes; no persistence |
| POST `/api/settings/save` | Atomic local config/credential save; revision and CSRF required |
| POST `/api/settings/remove` | Remove local managed connection and unused secrets; never provider records |
| POST `/api/refresh` | `project`; requires `X-Release-Calendar: local`; only writes local state |

JSON dates are `YYYY-MM-DD` without UTC conversion. Instants are ISO timestamps. Events carry `kind`, `start`, `end`, `source` (`jira`/`rule`), `sourceDetail`, and stable release ID. App observations use `observedAt`, never an invented provider change timestamp. `productionDeployment` is always `unknown` because no deployment evidence connector exists.

Read APIs never implicitly sync. Desktop and web server lifetimes own a startup + five-minute-after-completion synchronization loop; CLI one-shot queries remain cache-only. Concurrent manual and automatic refreshes share a promise keyed by cache path. Shutdown aborts provider requests and waits for cache locks to be released. This makes CLI and UI use the same stored snapshot and calculation logic. A future MCP adapter can expose only Queries' read methods, using the same IDs, warnings, evidence and trust boundary. Other local Admin clients can use this API with same-origin hosting; broad CORS and unauthenticated public exposure are intentionally absent.

The source provider text is inert data: Jira bodies/comments are not fetched; PR bodies are transiently inspected for exact keys and are not persisted. Summaries/titles remain untrusted text, rendered with `textContent`. Links are parsed as HTTPS. Credentials entered into the settings form travel only in a same-origin POST to the loopback server. Saved credentials are never returned in GET/save responses, embedded in browser bundles, or placed in URLs. The server resolves private local credentials or explicitly configured environment variables for HttpReader. Errors are stable codes, not raw provider bodies or URLs with credentials.

## Extending connectors

Add a new collector producing the existing validated Release/Ticket/Pull records with provider-scoped stable IDs, explicit coverage and link evidence. Keep REST endpoint and MCP read-tool allowlists and parsing at the connector boundary. Do not add source mutations to Runtime or Queries. Jira Data Center and GitHub Enterprise require separate host/auth/API contracts; the Cloud/com allowlists must not be relaxed implicitly.

## Native macOS companion

`desktop/` contains an AppKit status item, SwiftUI popover, typed HTTP decoding and a Process owner. `src/desktop.ts` launches the same Hono app on an OS-assigned loopback port and loads local desktop credentials only for configured env names. An inherited stdin pipe establishes ownership: EOF/termination shuts down that app's server. The native wrapper never owns CLI-launched servers. SwiftUI cards consume `/api/menu`, which derives phases/deadlines from `Queries.guide`; there is no separate schedule engine. Web links carry validated project/release/month parameters. `scripts/build-macos.mjs` bundles server/web into an ad-hoc signed `.app`, referring to the machine's existing Node.js installation.

## Shared local settings

`Connections` serves web, native and CLI. A 0600 `connections.json` stores config and credentials in one atomic revision. A directory lock and optimistic revision prevent concurrent editors from overwriting each other. Host/Origin validation, a per-server CSRF header and a 64 KiB body limit protect local writes. The managed document takes precedence over legacy config; explicit config paths use a separate sidecar. Removing all managed entries persists an empty document rather than resurrecting legacy settings. Legacy source files remain untouched. Settings changes can alter the cache namespace; old observations remain on disk and new settings require fresh collection.

The native settings window embeds the same web UI in nonpersistent WKWebView. External token issuance links open the normal browser. The shared OAuth controller supports browser authorization, local callback handling and rotating token refresh. Jira uses public client metadata (CIMD) with Atlassian MCP v2; GitHub uses the installed gh browser/device flow in an isolated temporary config directory; legacy GitHub App grants remain compatible. Business data APIs never receive mutations.

## OAuth boundary

`src/auth/` owns a separate private atomic auth document, one-use random state, Jira MCP/GitHub S256 PKCE, a temporary loopback callback listener, provider discovery pagination, and serialized token rotation. `Runtime` injects a lazy OAuth bearer resolver into the existing GET readers; OAuth authentication failures therefore follow the existing last-good snapshot preservation path. Fixed authentication endpoints accept POST for registration/exchange/refresh; the official Atlassian MCP endpoint accepts protocol POSTs with a closed read-tool allowlist. Runtime chooses the matching MCP or REST reader lazily inside sync, so authentication failures preserve cached schedules. No generic outbound mutation method is exposed.

Local `/api/settings/oauth` routes inherit settings CSRF, Origin and body-size guards. POST operations configure/start/cancel/forget/select; GET operations expose safe status and selectable resources. OAuth callbacks use a separate fixed-port listener so the native app's ephemeral web port does not need provider registration. App secrets and tokens never enter callback HTML or status JSON. A user selection is validated against newly fetched accessible resources before persisting a project.

`src/auth/github-browser.ts` owns the gh child process, removes inherited GitHub credentials, uses a private temporary CLI store without shared-keychain writes, captures only the device verification code, and redacts CLI errors. The resulting token is stored in the existing private auth document. A `github-cli` grant discovers repositories via paginated GET `/user/repos`; legacy App grants keep installation-based discovery. Desktop shutdown awaits owned authentication cleanup before exiting.
