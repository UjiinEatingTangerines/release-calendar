# Release Calendar design system

## 0. Research Log

- Embedded references: shortlisted Cal.com, Linear, and Notion; read the minimalist execution reference and Cal.com system in full. Selected the scheduling reference's neutral frame, confident month typography, compact controls, and restrained surface depth. System fonts replace brand fonts for offline installation and Korean coverage.
- Lazyweb: two successful desktop queries, `calendar monthly scheduling` and `project release detail`; viewed two screens, Jobber monthly scheduling and ActiveCollab calendar. Adopted the clear month-control strip, muted adjacent-month cells, and continuous horizontal period lanes with repeated labels at week boundaries. No screenshots, brand copy, remote assets, credentials, or signed research URLs ship in this repository.
- Spatial reference: [StyleGallery list-detail](https://github.com/changeroa/StyleGallery/blob/main/patterns/split-sidebar/list-detail.md), retrieved through its catalog. Calendar selection and its details remain adjacent in source order; **the document owns vertical scrolling**, with no nested scrolling panes. The layout reflows when the calendar and detail minimum widths cannot coexist. This is a structural interpretation, not copied source.
- Generated concepts: a private research board contained two drafts, A with a wide calendar and right detail panel, B with details below the calendar. Selected A for desktop and B's reading order for small screens. The draft is research-only, not a bundled asset or evidence that the implementation passed visual QA. Its accidental accent borders and color gradients are rejected by the contract below.
- No reference assets or external fonts are required at runtime. This document defines the implementation contract; the finished DOM and screenshots still require separate verification.

## 1. Atmosphere & Identity

A quiet planning surface, with a generous month heading over an orderly seven-column calendar. The signature is the contrast between a neutral paper-like frame and small, continuous pastel release periods. Calendar and provenance labels carry the meaning; decorative illustrations, marketing sections, and metric-card rows have no job here. Korean is the initial locale, with primary product labels routed through a typed locale dictionary; a complete second locale remains an extension.

Content order follows the task: identify project and data freshness, navigate the month, scan release periods, select a day or release, inspect its evidence and tickets, then find undated releases. The primary persona scans overlapping releases at a desktop; the mobile persona selects a day and reads details beneath the compact month; the keyboard persona follows the same source order and receives a visible selected state.

## 2. Color

| Role/token | Value | Use |
| --- | --- | --- |
| `--canvas` | `#f7f8f6` | Outer canvas and quiet gutters |
| `--surface` | `#ffffff` | Calendar, details, controls |
| `--surface-muted` | `#f3f5f3` | Weekend and adjacent-month treatment |
| `--ink` | `#242424` | Main text and primary controls |
| `--muted` | `#626766` | Secondary text, never essential disabled-looking text |
| `--border` | `#e4e7e5` | Neutral dividers |
| `--hover` | `#edf0ed` | Pointer hover wash |
| `--selected` | `#e5eae5` | Selected date/control wash with textual or glyph indication |
| `--focus` | `#215ab0` | Keyboard outline only |
| `--development` / `--development-bg` | `#216d62` / `#e2f2ec` | Development interval |
| `--cutoff` / `--cutoff-bg` | `#81520a` / `#fff0cf` | Feature cutoff and stale-data warnings |
| `--qa` / `--qa-bg` | `#63459a` / `#eee7f9` | QA interval or milestone |
| `--release` / `--release-bg` | `#a34739` / `#fbe8e2` | Release date, not proof of successful deployment |
| `--danger` / `--danger-bg` | `#a22f35` / `#fceced` | Connection failure |
| `--inverse` | `#ffffff` | Text on the ink action/today indicator |

Color marks event type, never confidence by itself. Every event names its type; provenance appears independently as `Jira`, `예상`, or `관측`. Release state, issue status, PR merge state, checks, and production deployment are separate fields. Today uses a compact ink-filled date indicator plus `오늘` in the accessible name. Unknown is plain text, never a success color. First version is an explicit light surface under both operating-system color preferences; it does not promise a dark theme.

## 3. Typography

Use `-apple-system, BlinkMacSystemFont, "Segoe UI", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif`. Metadata identifiers may use `ui-monospace, SFMono-Regular, Consolas, monospace`. No network font requests.

| Token | Size | Weight / line height | Role |
| --- | --- | --- | --- |
| `--text-month` | `32px` | 700 / 1.2 | Desktop month |
| `--text-title` | `24px` | 650 / 1.3 | App or narrow month heading |
| `--text-section` | `18px` | 650 / 1.4 | Detail heading |
| `--text-body` | `14px` | 400 / 1.6 | Controls and body |
| `--text-meta` | `12px` | 500 / 1.5 | Provenance, compact calendar labels |

Body and detailed ticket prose stay at 14px minimum. Dense event labels use 12px only with the full content available in the detail panel. Use tabular numerals for dates; do not letter-space Korean body copy. Long issue names wrap in detail rows; compact labels may ellipsize with an accessible full name. Unbroken URLs use `overflow-wrap: anywhere`.

## 4. Spacing & Layout

Spacing tokens `--space-1` through `--space-6` are 4, 8, 12, 16, 20, 24px; `--space-8` is 32px; `--space-10` is 40px. Control height `--control-size` is 40px, touch height `--touch-size` is 44px, day header `--day-header` is 36px, compact event lane `--event-height` is 24px, page width `--page-max` is 1600px, detail width `--detail-width` is 336px. Borders and outline thickness are 1px and 2px respectively.

- At 1100px and above, use a fluid calendar with `minmax(0, 1fr)` and a 336px detail column, separated by 24px. A desktop week has a minimum height of 132px and can grow when expanded. Avoid fixed viewport height.
- At 700–1099px, details follow the calendar; controls wrap. At less than 700px, render a compact seven-column month with minimum 52px day height, event counts/short labels, and a selected-day agenda below. Do not force a horizontally scrolling desktop calendar onto a phone.
- Page padding is 32px desktop and 16px narrow. All grid children use `min-inline-size: 0`. The document is the only vertical scroll owner; no `overflow: auto` detail pane and no fixed body height.
- Calendar runs Monday through Sunday, includes previous/next-month boundary dates, and shows every necessary week. Date-only strings retain their calendar date. Project timezone controls today and timestamp formatting.
- A development interval is split into weekly grid segments. Continuations meet the calendar edges with square continuation ends and a visible/accessibly named continuation marker; true starts/ends use the small radius. Each overlapping release has a separate lane. Labels repeat at each week to retain context.
- Default density favors releases. The explicit ticket-date toggle adds only mapped ticket dates; tickets without individual dates remain in their own detail group. At most three visible compact items/lanes per date or week before a labeled expansion control. Expanded items remain in document flow.

## 5. Components

Use small TypeScript DOM factories and CSS classes; avoid screen-specific inline styling. Before composing the product screen, render a primitive state harness at phone, tablet, and desktop widths.

| Primitive | Structure and variants | Required states / accessibility |
| --- | --- | --- |
| Action | Native button; ink primary, bordered secondary, quiet utility; consistent 40/44px height | Default, hover, pressed, visible focus, disabled, refreshing label; icon-only buttons have Korean accessible names |
| LabeledSelect | Label + native select; project, release, optional ticket-date checkbox | Full keyboard use, visible selected value, disabled/no-option state; filter changes preserve a valid focus target |
| ProvenanceTag | Small text tag, neutral source/observation and semantic expected-state variants | Always contains text, not only colored dot; no action styling on a noninteractive tag |
| EventButton / PeriodSegment | Native button in a calendar grid lane; development/cutoff/QA/release/ticket variants | Accessible name includes release, type, dates, source, and continuation; default/hover/selected/focus; no drag affordance or external write action |
| CalendarDay | Date button plus non-nested event buttons; current/adjacent month, today, selected | Today uses `aria-current="date"`; selected date has visible label/wash; arrow keys traverse days, Home/End week, Enter/Space selects; tab can reach event details |
| MoreButton | Quiet native button with item count | `aria-expanded`, accurate count, same-screen reveal, keyboard reachable |
| DetailPanel | Named section, heading, definition list, independent status fields, ticket groups, source links | Empty selection, selected event, no individual schedule, no PR evidence, unknown deployment, long-label wrap; source links remain real anchors |
| DataNotice | Inline status paragraph with freshness timestamp and retry button when useful | Loading, stale, partial failure, authentication failure, empty month, no future plans; polite live status updates, no clearing last good data |
| UndatedList | Heading and compact release buttons | Empty and populated, filterable; explicit missing-date wording |

Details expose version name, source identity/link, periods and date provenance, issues with assignee/status/due dates, related PR evidence, app observation history, and the lack of deployment evidence. Jira text is inert text, never injected HTML or instructions. A source link is labeled with the provider and opens safely without leaking credentials.

## 6. Motion & Interaction

Motion is optional for this operational tool. State updates are immediate and retain focus; no entry stagger, decorative hover lift, or animated calendar reflow. If a subtle detail fade is used, `--motion-fast: 120ms` with `ease-out` animates opacity only. Reduced-motion preference disables nonessential transitions. No dependency is required for animation.

Previous month, next month, today, month input, project filter, release filter, selected day, selected release, ticket-date toggle, and expansion state are explicit app state. Navigation does not impose an arbitrary historical/future range. Manual refresh disables only the refresh action while running and displays errors beside freshness. Selecting a release changes same-screen details; on mobile, selecting a day exposes its agenda without automatically moving focus off the date.

## 7. Depth & Surface

Use a mixed but restrained strategy: neutral 1px dividers for the calendar, tonal weekend/adjacent-month cells, and one low-opacity shadow on the outer detail surface. `--shadow-panel: 0 1px 3px rgb(36 36 36 / 4%)`; `--radius-sm: 4px`, `--radius-control: 6px`, `--radius-panel: 12px`, `--radius-full: 9999px` for the tiny today badge only. Do not wrap every metadata line in its own card. No colored accent borders, gradients, glass, or decoration. Keyboard focus outlines are the sole colored edge exception.

## 8. Accessibility Constraints & Accepted Debt

Target WCAG 2.2 AA: normal text 4.5:1, large text and necessary graphical distinctions 3:1, visible keyboard focus, semantic landmarks, named controls, and non-color state labels. Verify measured contrast rather than assuming these proposed tokens pass every composition. At 200% text zoom and 390px width, key controls wrap and details remain readable without horizontal document scrolling. Keep small-screen day targets at least 44px where the available seven-column geometry allows; on narrower screens, retain at least the WCAG 24px minimum and comfortable selected-day controls.

Verification must exercise keyboard-only month navigation and event selection, desktop detail reading, mobile selected-day reading, long Korean labels, missing dates, no releases, multiple simultaneous releases, stale cache, and connection failure. Screenshots establish geometry only; keyboard and screen-reader claims require interaction evidence. Test under both light and dark OS preference to verify the deliberate light theme remains readable.

Accepted design/accessibility debt: none approved. No completed visual-QA claim is made by this design specification. Any implementation deviation must be documented and assessed before release.

## 9. Native macOS popover (0.2)

User-directed reference research: [OpenUsage dashboard](https://github.com/robinebers/openusage/blob/66aada23bfbac5c5988617fdd6a0f8edbe106764/docs/dashboard.md), its Theme/PopoverTopBar/PopoverFooter source and public dashboard screenshot were read/viewed; [CodexBar](https://github.com/steipete/CodexBar/tree/ab8367a637de6d68ace155347ae2f4a4f5f54ad3) public redacted menu screenshot was viewed. Adopt grouped data cards, strong primary metrics, semantic status color and a persistent utility footer. Do not copy logos, assets, provider-auth discovery or usage meters. A release countdown is not a completion percentage. Reference assets stay in ignored QA artifacts.

Spatial contract: [scroll-body-shell](https://github.com/changeroa/StyleGallery/blob/main/patterns/viewport-shell/scroll-body-shell.md). An AppKit NSPopover contains a native SwiftUI surface, width 388pt, height bounded by available screen height (target 660pt). Header/project selector and footer/web action remain visible; only the middle release list scrolls. Native outside click/Escape dismissal. On tiny displays reduce content height, not text size. The website retains its existing design.

Native tokens: spacing 4/6/8/10/12/16/20; 16pt outer gutter; 12pt card radius; capsule badges; SF system typography 11pt metadata, 12pt body, 13pt card title, 17pt title, 24pt countdown. Numbers use monospaced digits. Adaptive NSColor windowBackgroundColor / controlBackgroundColor surfaces with a subtle neutral separator. No colored borders. Semantic tints: blue development, purple expected QA, orange freeze/near deadline, teal planned release, red overdue, secondary gray unscheduled. Badge foreground uses adaptive dark/light inks with a 10% tint wash. Each includes a text label and optional SF Symbol; never color alone. D-day accent is separate from schedule phase; teal never means deployed.

Primitives: StatusBadge (phase/source/mode/warning); ReleaseCard (name, D-day, phase, Jira date, next deadline, web disclosure); CompactAction (32pt target, SF Symbol, accessible name, default/pressed/disabled/focus); FreshnessFooter (local data time, refresh, settings); EmptyState (missing data/no plan/start failure). App loading retains prior data, shows a small progress indicator, disables duplicate refresh. Authentication/stale errors use human Korean copy, with original codes in help text. Long names wrap to two lines and expose full labels via help/accessibility. Unscheduled plans remain visible. Source labels say Jira or expected rule. No unsupported claims of production readiness.

Accessibility: native buttons/pickers, system focus behavior, VoiceOver names, explicit phase text and unknown production state, readable light/dark surfaces, no decorative animation. Dynamic OS appearance supported by semantic colors. Accepted verification limit: OS-level menu clicking/capture requires macOS Accessibility/Screen Recording permissions; same native SwiftUI view can be rendered and inspected in an app-owned snapshot harness without capturing user screen content. Native view snapshots do not substitute for full VoiceOver certification.

Native badge ink refinement: light/dark pairs blue #205EB8/#79AEFF, purple #7442AA/#C0A0FF, amber #8C5108/#F2BF63, teal #187563/#6AC9B1, red #B23939/#FF9393. Metadata/badge neutral #626262/#AAAAAA. CTA #245DC1 with white text. Use these explicit accessible inks rather than pale system-orange text on a pale badge. Native surface backgrounds remain adaptive system colors.

## 10. Local connection settings

A shared settings page is available from the web header and a native application Settings window (nonpersistent WKWebView). Reuse existing surface, spacing, typography and semantic badge tokens. A compact left connection list and right editor becomes one column below 720px. The document owns scrolling; the action row stays sticky at the bottom of the editor. Native window starts at 920×760 and resizes down to 540×600. Cards group Jira, optional GitHub and optional schedule rules, with numbered section labels and read-only/local-storage badges. A step row explains input → connection check → save/sync. No token appears in a GET response, DOM preload, localStorage or URL. Secret inputs are empty/password fields, marked saved when present, and cleared after save. Blank means keep; endpoint changes require fresh Jira credentials.

States: new connection, existing configured connection, checking, each-provider success/failure, stale edit/reload, saving, saved with sync warning, disconnect confirmation. Errors live next to actions in a polite status region; form fields keep values on failure. Every field has a label, requirements/help and keyboard focus. Token-creation links open only provider public account pages. Connection removal is local-only and explicitly confirmed; preserve original-provider data and local observation cache. No configuration JSON editing is needed for basic connections; advanced existing fields are preserved when editing basic form fields.

## 11. Browser sign-in

Settings begins with two provider cards and a three-step sign-in → select resources → save flow. Existing semantic badges distinguish app registration needed, browser approval pending, and connected. Tokens/client secrets are never prefilled. The one-time app-owner setup is collapsed behind a clearly labeled setup action; daily connection uses browser sign-in buttons. Jira sites/projects and GitHub repositories are chosen from fetched lists. Authentication uses the normal browser from both web and WKWebView; a visible continue link remains available if popup opening is blocked. Pending login exposes cancel and expiry states. Existing manual configuration remains an advanced fallback. The existing settings tokens, keyboard focus, mobile stacking, and status live region apply.

Disabled actions use a default cursor, never a waiting cursor. An unconfigured login shows an enabled “로그인 준비하기” action opening and focusing its registration disclosure, plus a persistent explanation linked with aria-describedby; waiting for browser approval has a distinct visible label.

Jira is ready for browser sign-in without owner fields. Its card explains browser consent and reuse of this app’s local authentication. GitHub has no owner-registration fields. It opens the official device login, shows the one-time code and a copy action, and explains the difference between CLI consent scopes and the app’s read-only operations. Missing gh shows an installation link; cancellation clears the code. Clipboard failure retains the visible code and browser link.

Provider authentication cards refresh from server state after login and logout. Signed-out cards expose only one sign-in action and no stale authentication timestamp or logout action. Signed-in cards show a semantic connected badge, a disabled sign-in action, a separately labeled authentication timestamp, resource selection, and local logout; no redundant reauthorize action is offered. Pending authorization remains cancellable after reopening settings.

Codex-backed Jira cards identify the shared authentication owner. The timestamp is labeled connection verification time, never the original Codex sign-in time. Reuse completes without a browser; missing authentication opens Codex consent. Local logout clearly states that Codex remains signed in.

Provider failures appear as deduplicated `Jira 조회 실패` / `GitHub 조회 실패` text badges above the warning copy. Web uses danger tokens; native uses the existing amber warning palette and SF Symbol. Generic stale/empty warnings do not imply a provider failure. Successful refresh removes resolved badges.

Planning is a separate `계획 기간` event with muted ink/selected wash on web and teal/checklist on native. Rule-derived development and planning carry estimated provenance; planning ends on its last counted day and development starts on the next eligible day.
