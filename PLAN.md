# Resource Hub — Phased Implementation Plan

A personal "resource hub + project manager": a visual library of everything saved online
(rendered and playable inline), nested projects, and a full task + calendar system. Anyone
can sign in with Google; each account gets its own private library. This document is the
build plan. We implement it **one phase at a time**, and the app must build, lint,
typecheck and run at the end of every phase.

> Status legend: `[ ]` not started · `[~]` in progress · `[x]` done

| Phase | Scope | Status |
| ----- | ----- | ------ |
| 1 | Foundation, Google login, app shell, design tokens | [x] |
| 2 | Resources: add, detection, metadata, per-type cards, inline playback, R2 uploads, Inbox, capture | [x] |
| 3 | Projects: nested tree, CRUD, drag-and-drop, link/unlink/move, bulk actions | [x] |
| 4 | Tasks: CRUD, rich description, checklist, list + board, resource linking, quick-add | [x] |
| 5 | Calendar: month/week/day/agenda, scheduling DnD, recurrence, reminders, filters, ICS | [ ] |
| 6 | Search, tags, trash/undo, export, hardening, performance, docs | [ ] |
| 7 | _Extra:_ Content understanding: text capture, AI summaries, tag/project suggestions, image descriptions | [ ] |
| 8 | _Extra:_ Semantic + hybrid search, natural-language filters, related items | [ ] |
| 9 | _Extra:_ AI assistant: ask your library, inbox autopilot, tasks from resources, weekly review | [ ] |
| 10 | _Extra:_ Reader view, highlights, video notes, page archive, link health | [ ] |
| 11 | _Extra:_ Capture everywhere: browser extension, importers, feeds, rules | [ ] |
| 12 | _Extra:_ Rediscover, smart collections, web push, offline, insights | [ ] |
| 13 | _Extra:_ Share links, collaboration, MCP server, integrations | [ ] |

---

## 0. Starting point (what's already in the repo)

- Next.js **16.3.6** (App Router, Turbopack default), React 19.2, TypeScript, pnpm.
- Tailwind CSS v4 (CSS-first config in `app/globals.css`), shadcn/ui **`base-nova`** style
  (components are built on **`@base-ui/react`**, not Radix), lucide icons.
- `next-themes` + a `d` hotkey theme toggle (to be **removed**: the app has one theme only).

Next 16 specifics we must respect (from `node_modules/next/dist/docs/`):

- `middleware.ts` is now **`proxy.ts`** (same API, exported `proxy` function). It is only
  for optimistic redirects, never the real authorization check.
- Request APIs are **async only**: `await params`, `await searchParams`, `await cookies()`,
  `await headers()`. Use the generated `PageProps<'/route/[id]'>` helpers (`next typegen`).
- Caching APIs: `revalidateTag`, `updateTag`, `refresh`, `cacheLife`/`cacheTag`. We keep
  app data **dynamic** (per-user, private) and do not enable Cache Components initially.
- `after()` from `next/server` for work that runs after the response (metadata fetching).
- Before writing code in each phase, re-read the relevant guide in
  `node_modules/next/dist/docs/01-app/` (route handlers, proxy, authentication, forms,
  data-security, lazy-loading, progressive-web-apps).

---

## 1. Key decisions (veto any of these before Phase 1 starts)

| Concern | Choice | Why |
| --- | --- | --- |
| Database | **PostgreSQL** (Neon in prod, Docker locally) | Recursive CTEs for trees, full-text search, `jsonb` snapshots, `pg_trgm` |
| ORM | **Drizzle ORM** + `drizzle-kit` migrations, `postgres` (postgres-js) driver | Typed SQL, easy raw CTEs, works with Neon and local PG |
| Auth | **Better Auth** with Google provider only + Drizzle adapter | First-class Next 16 support, DB sessions, simple to restrict to Google |
| Access control | Open sign-up (any Google account); isolation by `user_id` in the DAL | No gatekeeping: the original `ALLOWED_EMAILS` allowlist was removed. Per-user quotas (6.5) are the abuse guard instead |
| Client data layer | **TanStack Query** over REST route handlers (`/api/v1/*`) | Optimistic updates + rollback, infinite queries, same API used by capture/shortcuts |
| Validation | **Zod** schemas shared by client and server | One source of truth for input rules |
| Storage | **Cloudflare R2** via `@aws-sdk/client-s3` + `s3-request-presigner`; every key under `resource/` | S3-compatible presigned PUT/GET; the prefix keeps this app's objects in one place in the bucket |
| Images | `sharp` (server) for thumbnails and dimensions | Already allowed in `pnpm-workspace.yaml` |
| Drag and drop | **dnd-kit** (tree, board, cards → sidebar) | One `DndContext` in the shell lets cards drop onto sidebar projects |
| Calendar | **FullCalendar v6** MIT plugins (daygrid, timegrid, list, interaction, rrule) | Month/week/day/agenda, drag, resize, external drop; themed with our tokens |
| Rich text | **Tiptap** (StarterKit, TaskList, Link, Placeholder) | Checklists + links in descriptions and notes; stored as JSON + plain text |
| Dates | `date-fns` v4 + `@date-fns/tz`, `chrono-node` (NL parsing), `rrule` | Recurrence + quick-add parsing |
| Search | Postgres FTS (`tsvector` generated columns + GIN) + `pg_trgm` | No extra service. Semantic search is layered on top in Phase 8, not a replacement |
| UI extras | `sonner` (toasts/undo), `cmdk` (command palette/search), `yet-another-react-lightbox`, `@tanstack/react-virtual`, `react-hotkeys-hook` | |
| Sanitizing | `sanitize-html` on the server for any fetched/stored HTML; React escaping elsewhere | XSS prevention |
| Tests | **Vitest** (unit: parsers, detection, tree, recurrence), **Playwright** (smoke e2e) | |
| Hosting | Vercel + Neon + R2 (any Node host works) | Cron routes for cleanup jobs |

Conventions:

- IDs: UUID v7 (`uuidv7` package), time-sortable.
- Every table owned by a user has `user_id`, and every query goes through a data-access
  layer (`lib/server/dal/*`) that takes `userId` as a required argument. No route handler
  touches `db` directly.
- Soft delete via `deleted_at`; archive via `archived_at`.
- Ordering via fractional index strings (`fractional-indexing`) in `sort_key` columns, so a
  reorder updates one row.
- Pagination: keyset cursors (`created_at, id`), never offset, never "load everything".
- Timed dates are `timestamptz` (UTC). All-day tasks store a plain `date` to avoid
  timezone off-by-one bugs. User timezone lives in `user_settings`.
- Detail drawer state lives in the URL (`?r=<resourceId>` / `?t=<taskId>`) so it is
  deep-linkable and the Back button closes it.

---

## 2. Architecture overview

```
Browser (React 19, TanStack Query, dnd-kit, FullCalendar, Tiptap)
   │  fetch /api/v1/*  (cookie session, or Bearer token for capture)
   ▼
Next.js 16 route handlers ──► DAL (userId-scoped) ──► Drizzle ──► Postgres
   │                 │
   │                 └── after(): metadata fetchers (oEmbed / GitHub API / OG tags, SSRF-guarded)
   ├── /api/v1/uploads/*  ──► presigned PUT  ──► browser uploads directly to R2
   ├── /api/files/[id]    ──► auth check ──► 302 to short-lived presigned GET
   └── /api/cron/*        ──► retries, trash purge, orphan R2 cleanup (CRON_SECRET)
proxy.ts: optimistic redirect of signed-out users to the landing page (no DB access)
```

### Folder structure (target)

```
app/
  page.tsx                      landing ("Continue with Google"); redirects to /library if signed in
  (app)/layout.tsx              authenticated shell (sidebar, top bar, drawer, DndContext)
  (app)/library/  inbox/  tasks/  calendar/  search/  trash/  tags/  settings/
  (app)/projects/[projectId]/
  capture/page.tsx              share-target / bookmarklet landing
  api/auth/[...all]/route.ts    Better Auth handler
  api/v1/...                    REST API (resources, projects, tasks, tags, uploads, search, export, capture)
  api/files/[fileId]/route.ts   signed file access
  api/cron/[job]/route.ts       scheduled maintenance
  api/calendar/[token].ics/     ICS feed
  manifest.ts                   PWA manifest with share_target
proxy.ts
lib/
  env.ts                        Zod-validated env
  db/schema/*.ts  db/index.ts  db/seed.ts
  auth.ts  auth-client.ts
  server/dal/*.ts               userId-scoped data access
  server/r2.ts  server/rate-limit.ts  server/ssrf.ts  server/sanitize.ts
  resources/detect.ts           URL → type + canonical form
  resources/metadata/*.ts       per-platform fetchers
  tasks/quick-add.ts  tasks/recurrence.ts
  projects/tree.ts              build tree, roll-ups, cycle checks
  validation/*.ts               Zod schemas
components/
  ui/                           shadcn (base-ui)
  shell/  resources/cards/  resources/full-view/  projects/  tasks/  calendar/  search/
hooks/
  queries/*.ts                  TanStack Query hooks + optimistic mutations
  use-media-controller.ts       "only one video plays"
docs/
  EMBEDS.md                     platform embed limitations
```

---

## 3. Data model (full target; each phase adds its part)

Better Auth tables: `user`, `session`, `account`, `verification`.

| Table | Key columns | Phase |
| --- | --- | --- |
| `user_settings` | `user_id` PK, `timezone`, `week_start`, `calendar_color_mode`, `library_view`, `ics_token` | 1 |
| `api_tokens` | `id`, `user_id`, `name`, `token_hash`, `last_used_at` | 2 |
| `resources` | `id`, `user_id`, `type` (enum), `url`, `url_normalized`, `title`, `description`, `notes`, `body_json` (text notes), `metadata` jsonb (snapshot), `metadata_override` jsonb, `metadata_status` (pending/ok/failed), `metadata_fetched_at`, `embed_status` (unknown/ok/unavailable), `thumbnail_file_id`, `is_favorite`, `is_reviewed`, `extracted_text`, `search` tsvector (generated), `deleted_at`, timestamps | 2 |
| `files` | `id`, `user_id`, `resource_id`, `role` (original/thumbnail/preview), `r2_key`, `mime`, `size`, `width`, `height`, `status` (pending/ready/deleting), `created_at` | 2 |
| `jobs` | `id`, `user_id`, `kind`, `payload` jsonb, `attempts`, `run_after`, `last_error` | 2 |
| `rate_limits` | `key`, `window_start`, `count` | 2 |
| `projects` | `id`, `user_id`, `parent_id` (self FK), `name`, `description`, `icon`, `color`, `sort_key`, `archived_at`, `deleted_at`, timestamps | 3 |
| `project_resources` | PK(`project_id`, `resource_id`), `sort_key`, `added_at` | 3 |
| `tasks` | `id`, `user_id`, `project_id`, `title`, `description_json`, `description_text`, `status`, `priority`, `start_at`, `due_at`, `start_date`, `due_date`, `all_day`, `rrule`, `exdates` (timestamptz[]), `series_id`, `original_occurrence_at`, `completed_at`, `archived_at`, `deleted_at`, `sort_key`, `search` tsvector, timestamps | 4 |
| `task_checklist_items` | `id`, `task_id`, `title`, `done`, `sort_key` | 4 |
| `task_resources` | PK(`task_id`, `resource_id`), `added_at` | 4 |
| `task_reminders` | `id`, `task_id`, `offset_minutes`, `dismissed_for` (occurrence) | 5 |
| `tags` | `id`, `user_id`, `name`, `name_normalized` (unique per user), `color` | 2 (resources), 4 (tasks) |
| `resource_tags`, `task_tags` | composite PKs | 2 / 4 |

Rules:

- Join tables are the only thing touched by link/unlink/move. Deleting a project removes
  `project_resources` rows, never resources.
- Indexes: `(user_id, deleted_at, created_at desc)` on resources and tasks;
  `(user_id, parent_id, sort_key)` on projects; `(user_id, url_normalized)` on resources;
  GIN on every `search` column; trigram GIN on titles and tag names.
- Project subtree: adjacency list + recursive CTE (`WITH RECURSIVE`) for "include
  sub-projects" queries. The sidebar loads the whole tree once (a personal tree is small)
  with **direct** counts, and roll-ups are computed in memory. A move is rejected if the
  target parent is the project itself or one of its descendants (checked server-side with
  a CTE, and drop targets are disabled client-side).

---

## Phase 1 — Foundation, Google login, app shell, design tokens

**Goal:** sign in with Google, land in an empty but complete-looking dark/orange shell
with working navigation on desktop and phone.

### 1.1 Tooling and config
- [x] Add deps: `drizzle-orm`, `postgres`, `drizzle-kit`, `better-auth`, `zod`,
  `@tanstack/react-query`, `sonner`, `uuidv7`, `vitest`, `@playwright/test`.
- [x] `lib/env.ts`: Zod-validated server env; app fails fast with a clear message if a var is missing.
- [x] `.env.example` (and add `!.env.example` to `.gitignore`, which currently ignores `.env*`).
- [x] `docker-compose.yml` with Postgres 16 for local dev.
- [x] Scripts: `db:generate`, `db:migrate`, `db:studio`, `db:seed`, `test`, `test:e2e`.

### 1.2 Database and auth
- [x] Drizzle setup (`lib/db`), Better Auth schema, `user_settings`.
- [x] `lib/auth.ts`: Better Auth with **only** the Google social provider (no email/password).
  Any Google account can sign up (the original allowlist was removed, see notes).
- [x] `app/api/auth/[...all]/route.ts` handler; `lib/auth-client.ts`.
- [x] `lib/server/dal/session.ts`: `requireUser()` (reads the session via `await headers()`,
  returns 401 for API routes / redirects for pages). Every route handler calls it.
- [x] `proxy.ts`: cookie-presence check → redirect signed-out users to `/`; let `/`,
  `/api/auth/*`, static assets and `/api/v1/capture` (token auth) through.

### 1.3 Design tokens (single theme)
- [x] Remove `next-themes`, `components/theme-provider.tsx` and the `d` hotkey; drop the
  `.dark` / light split. Set `color-scheme: dark` on `<html>`.
- [x] Define tokens once in `app/globals.css` `:root` and map them to shadcn variables
  (`--background`, `--card`, `--primary`, `--ring`, …) and Tailwind `@theme` so every
  shadcn component inherits the palette automatically:

  | Token | Value | Use |
  | --- | --- | --- |
  | `--bg` | `#0A0A0A` | app background |
  | `--bg-sunken` | `#050505` | sidebar, wells |
  | `--surface` | `#141414` | cards, panels |
  | `--surface-raised` | `#1A1A1A` | popovers, hovered cards |
  | `--border` | `#262626` | hairlines |
  | `--border-strong` | `#333333` | inputs, dividers |
  | `--text` | `#F5F5F4` | primary text |
  | `--text-muted` | `#A3A3A3` | secondary text (≥ 7:1 on `--bg`) |
  | `--text-subtle` | `#8A8A8A` | tertiary/meta (≥ 4.5:1) |
  | `--accent` | `#FF6A00` | primary actions, focus, active, today |
  | `--accent-hover` | `#FF7A1A` | hover/glow |
  | `--accent-fg` | `#0A0A0A` | text on orange (white on orange fails contrast) |
  | `--accent-soft` | `rgb(255 106 0 / 0.12)` | selected backgrounds |
  | `--glow` | `0 0 0 1px var(--accent), 0 0 16px rgb(255 106 0 / .35)` | hover/focus glow |
  | priority | low `#737373`, medium `#EAB308`, high `#FF7A1A`, urgent `#EF4444` | |
  | project palette | 10 dark-friendly hues (orange, amber, rose, violet, sky, teal, lime, …) | |

- [x] Radii, shadow and transition tokens; global `:focus-visible` ring in orange;
  `prefers-reduced-motion` respected.

### 1.4 Shell
- [x] Landing page `/`: logo, one-line pitch, single "Continue with Google" button.
- [x] `(app)/layout.tsx`: left sidebar (nav: Library, Inbox, Tasks, Calendar, Search, Trash;
  placeholder "Projects" section), top bar (search trigger, **Add resource**, **Add task**,
  user menu with Google avatar, name, Settings, Logout), main area, right detail drawer
  (empty placeholder driven by `?r=`/`?t=`).
- [x] Mobile: sidebar → slide-over drawer (hamburger), drawer → full-screen sheet, top-bar
  actions collapse into a FAB/menu.
- [x] Shared primitives: `EmptyState`, `Skeleton` variants, error boundary + `error.tsx`,
  `loading.tsx`, toaster, `QueryClientProvider`.
- [x] Placeholder pages for each nav item with helpful empty states.

**Done when:** Google sign-in works for any Google account;
signing out returns to the landing page; `/api/v1/*` returns 401 without a session; the
shell works at 375px and 1440px widths; `pnpm build && pnpm lint && pnpm typecheck` pass.

**Implementation notes (Phase 1):**
- The orange token family is named `--brand`, `--brand-hover`, `--brand-fg`, `--brand-soft`
  (not `--accent*`): shadcn already uses `--accent` for neutral hover backgrounds, so
  reusing the name would turn every menu hover orange. Everything else matches the table.
- `docker-compose.yml` maps Postgres to host port **5433** (5432 was already taken locally).
- Env is validated lazily (`serverEnv()`) and at boot from `instrumentation.ts`, so
  `next build` works without secrets but `next dev/start` fails fast.
- The `ALLOWED_EMAILS` allowlist (Better Auth `user.validateUserInfo` + a second check in
  `getCurrentUser()`) was **removed on 2026-10-03**: sign-up is open. Data isolation is
  unchanged (every DAL call is scoped by `userId`), but storage and AI spend are no longer
  bounded by a known set of users, so quotas were added to 6.5.

---

## Phase 2 — Resources, metadata, rich cards, R2 uploads, Inbox, capture

**Goal:** save anything, see it rendered richly and playable inline, never needing to leave.

### 2.1 Schema and API
- [x] Tables: `resources`, `files`, `tags`, `resource_tags`, `jobs`, `rate_limits`, `api_tokens`.
- [x] Routes (all `requireUser`, Zod-validated, rate-limited on writes):
  - `GET /api/v1/resources` (cursor pagination; filters: type, tag, favorite, reviewed,
    unsorted, sort by created/updated/title)
  - `POST /api/v1/resources` (single), `POST /api/v1/resources/bulk` (many URLs)
  - `GET|PATCH|DELETE /api/v1/resources/:id` (DELETE = soft delete)
  - `POST /api/v1/resources/:id/refresh-metadata`
  - `GET /api/v1/resources/check-duplicate?url=`
  - `GET|POST /api/v1/tags` (autocomplete + create on the fly)

### 2.2 Type detection (`lib/resources/detect.ts`, unit-tested)
- [x] URL normalization (lowercase host, strip `utm_*`/tracking params, `www.`, trailing
  slash; canonical forms like `youtu.be/x` → `youtube.com/watch?v=x`, `x.com` ≡ `twitter.com`).
- [x] Patterns: Instagram (`/p/`, `/reel/`, `/reels/`, `/tv/`), YouTube (watch, shorts,
  `youtu.be`, `t=` start time), X (`/status/`), GitHub (repo, issue/PR, gist), Pinterest
  (`/pin/`, `pin.it`), generic link. Pasted text without a URL → note. Files by MIME → image/file.
- [x] Type is overridable in the add dialog and in edit.

### 2.3 Metadata snapshot (resilient, `lib/resources/metadata/*`)
- [x] Resources are created immediately with `metadata_status = pending`; fetching runs in
  `after()` so bulk add is fast. The client refetches until the status settles.
- [x] Fetchers (official endpoints first):
  - YouTube: oEmbed (title, channel, thumbnail); optional `YOUTUBE_API_KEY` → published
    date, duration.
  - Instagram: embed-only; optional Meta oEmbed token; otherwise OG tags when reachable.
    Usually minimal, so manual override and screenshot-thumbnail are first-class.
  - X: `publish.twitter.com/oembed` (text, author, date); counts only if available.
  - GitHub: REST API (repo: stars, forks, language, topics, pushed_at; issue: state,
    labels, comments; gist: files). Optional `GITHUB_TOKEN`. README fetched lazily on expand.
  - Pinterest: OG tags + image.
  - Generic: fetch HTML → OG / Twitter card / `<title>` / favicon / JSON-LD.
- [x] `lib/server/ssrf.ts`: http(s) only, DNS-resolve and block private/loopback/link-local
  ranges, cap redirects (3), timeout (8s), response size (2 MB), content-type check.
- [x] Retries with exponential backoff through the `jobs` table (3 attempts), then
  `metadata_status = failed` → plain link card + "Refresh metadata" action.
- [x] Thumbnails/OG images are **copied into R2** so cards survive the original being deleted.
- [x] All fetched strings are sanitized/stripped; any stored HTML goes through `sanitize-html`.

### 2.4 R2 uploads (`lib/server/r2.ts`)
- [x] `POST /api/v1/uploads` → validates MIME allowlist + size limit (images 20 MB, files
  50 MB, configurable), creates a `files` row (`pending`), returns a presigned PUT
  (5 min expiry) with `Content-Type` and `Content-Length` signed so R2 enforces them.
- [x] Browser uploads via `XMLHttpRequest` for per-file progress; supports multiple files,
  drag-and-drop, file picker and clipboard paste.
- [x] `POST /api/v1/uploads/:id/complete` → `HeadObject` to verify size/type → `sharp`
  generates a WebP thumbnail + reads dimensions → `ready`.
- [x] `GET /api/files/:id` → ownership check → 302 to a presigned GET (5 min);
  `Cache-Control: private`. Bucket stays private; no public URLs anywhere.
- [x] R2 CORS config documented in the README (PUT from the app origin).

### 2.5 UI
- [x] **Add resource** dialog: one smart box (paste URL / text / many lines, drop or paste
  files), detected type chip with override, tag input, duplicate warning with "Open existing"
  and "Add anyway", upload progress list. Project picker is added in Phase 3.
- [x] Per-type **cards** (`components/resources/cards/*`) and **full view**
  (`components/resources/full-view/*`):
  - Instagram: lazy click-to-load embed iframe; snapshot fallback with "Embed unavailable"
    note + "Open original".
  - YouTube: facade (thumbnail poster) → `youtube-nocookie` iframe with `enablejsapi`,
    start-time support.
  - X: official `widgets.js` embed (dark theme), snapshot card as fallback.
  - GitHub: repo card (stars, forks, language, topics, last update, expandable README
    rendered as sanitized markdown); compact issue/gist layouts.
  - Pinterest: image-forward card. Generic: favicon, title, description, hero image.
  - Image: card + lightbox (zoom, next/prev within current list), caption.
  - Note: Tiptap-rendered body + Copy button. File: name, size, type, preview (PDF in
    the browser's viewer via signed URL; images inline).
- [x] `useMediaController`: a single "active media" store. Starting one video pauses
  YouTube players via the IFrame API and unmounts other non-controllable embeds
  (Instagram/X/Pinterest iframes) back to their poster.
- [x] Embeds mount only when scrolled into view (`IntersectionObserver`) and unmount
  far off-screen.
- [x] Library: masonry grid (shortest-column placement), compact list (virtualized), focus
  view; infinite scroll; filter/sort bar. Cards show type badge, tags, project chips
  (Phase 3), linked-task count (Phase 4).
- [x] Detail drawer: full view + edit title, notes, tags, type, metadata override;
  favorite, reviewed, refresh metadata, delete. Optimistic updates with rollback.
- [x] Inbox page = resources with no project (until Phase 3, all resources).

### 2.6 Capture
- [x] `POST /api/v1/capture` accepting a session cookie **or** `Authorization: Bearer`
  personal token (hashed in `api_tokens`; created/revoked in Settings). Lands in Inbox.
- [x] `app/manifest.ts` PWA manifest with `share_target` → `/capture` (Android/Chrome).
- [x] `/capture` page: saves the shared URL/text, shows "Saved to Inbox", and closes itself
  when opened as a popup.
- [x] Bookmarklet (Settings page, drag-to-bookmarks-bar) opening `/capture?url=…&title=…`.
- [x] iOS Shortcut instructions (Safari has no Web Share Target) using the token endpoint.

### 2.7 Seed + docs
- [x] `db:seed` (CLI, targets `SEED_USER_EMAIL` after first login) + "Load demo data" button
  in empty states: one resource of every type with realistic snapshots.
- [x] `docs/EMBEDS.md` started.

**Done when:** each type can be added by URL/file and renders a rich card + full view;
videos play inline and only one at a time; a broken Instagram link shows the fallback;
bulk add of 20 links returns instantly and fills in; duplicates warn; files upload with
progress and are only reachable through signed URLs; capture from the bookmarklet works;
unit tests for detection, normalization and SSRF guard pass.

**Implementation notes (Phase 2):**
- Retries: first attempt runs inline in `after()`; retryable failures go to `jobs` with
  backoff 30 s / 2 min / 8 min (3 retries), then `failed`. Due jobs are picked up after
  list requests (the client polls every 3 s while anything is pending); the cron route
  in Phase 6 will also drain them.
- SSRF: an undici `Agent` with a custom DNS `lookup` rejects non-public addresses on every
  connection (closes the DNS-rebinding gap), plus literal-IP, port and credential checks.
- Snapshot images are copied to R2 as WebP (`role = preview`); user-uploaded custom
  thumbnails (`role = thumbnail`, `metadata.thumbnailIsCustom`) survive refreshes.
- R2 keys are `resource/u/<userId>/<fileId>/<name>` (`KEY_PREFIX` in `lib/server/r2.ts`):
  everything the app writes lives under `<bucket>/resource/`. The full key is stored in
  `files.r2_key`, so rows written before the prefix change keep resolving.
- Duplicate warning is shown for single-URL adds; multi-line bulk adds dedupe within the
  batch but don't warn about links saved earlier. Capture returns the existing resource.
- Masonry uses absolutely positioned items in one parent so a card that changes column
  keeps its state (a playing video doesn't restart).
- Not yet verified against live services (no credentials in the dev environment): Google
  sign-in round trip and R2 upload/download. Both are implemented per the docs; everything
  else was smoke-tested end to end with a real session.

---

## Phase 3 — Projects: nested tree, link/unlink/move, bulk actions

### 3.1 Schema and API
- [x] Tables: `projects`, `project_resources`.
- [x] Routes: `GET /api/v1/projects/tree` (all projects + direct counts),
  `POST /api/v1/projects`, `PATCH /api/v1/projects/:id` (rename, description, icon, color,
  archive), `POST /api/v1/projects/:id/move` (`parentId`, `beforeId`/`afterId` →
  fractional `sort_key`; cycle check), `DELETE /api/v1/projects/:id?mode=subtree|reparent`.
- [x] `GET /api/v1/projects/:id/resources?includeDescendants=true` (recursive CTE, paginated).
- [x] Linking: `POST /api/v1/projects/:id/resources` (link many), `DELETE …/resources`
  (unlink many), `POST /api/v1/resources/move` (`from`, `to`, `ids`) in one transaction.
- [x] `POST /api/v1/resources/bulk-actions` (link, unlink, move, tag, untag, favorite, delete).

### 3.2 UI
- [x] Sidebar tree: expand/collapse (persisted), counts (rolled up), inline rename, context
  menu (new sub-project, rename, color, archive, delete), keyboard navigation
  (arrow keys, Enter, F2).
- [x] dnd-kit tree: reorder and reparent with an indentation-based projection; invalid drops
  (own descendants) rejected server- and client-side; optimistic with rollback.
- [x] Shell-level `DndContext`: drag a resource card onto a sidebar project to link it.
- [x] Delete project dialog: "Delete whole subtree" vs "Move children up one level";
  copy makes clear resources are never deleted, only unlinked.
- [x] Project page: breadcrumb, editable name/description, "Include sub-projects" toggle,
  resource grid (same library components), "Add existing" picker, progress placeholder.
- [x] Resource detail: project chips with link/unlink and an "Add to project" picker.
  Cards show project chips. Add dialog gets a multi-project picker (defaults to Inbox).
- [x] Inbox "file it" flow: keyboard-driven triage (J/K to move, P opens project picker,
  Enter files and advances).
- [x] Multi-select (checkbox, Cmd/Ctrl+A) + bulk action bar (add/remove project, favorite,
  delete).
- [x] Undo toasts for unlink and move (re-link / move back in one click).

**Done when:** arbitrary-depth nesting works; moving a project under its own descendant is
impossible (UI and API); a resource can live in several projects and unlinking from one
leaves the others intact; roll-up toggle shows descendant resources; bulk link/move/tag
works; unit tests for tree building, roll-ups, cycle detection and sort keys.

**Implementation notes (Phase 3):**
- Roll-ups, cycle checks and the drag projection are computed **in memory** from the whole
  flat project list (`lib/projects/tree.ts`, `lib/projects/dnd-projection.ts`), not via a
  recursive SQL CTE — consistent with the plan's own note that a personal tree is small
  enough to load whole. `getDescendantIds` (used for "include sub-projects" and the move
  cycle check) does the same.
- The sidebar drag indicator shows the hovered row but not a live depth/indentation preview
  while dragging; the final depth is computed once on drop from `event.delta.x`. Reparenting
  and reordering both work, just without the "ghost indent line" some tree UIs show mid-drag.
- Dragging a resource card onto a sidebar project **links** it (doesn't remove it from other
  projects it may already be in); only one resource drags at a time — multi-select resources
  are filed via the bulk action bar's "Add to project" instead of drag.
- The mobile nav's sidebar copy renders a read-only tree (no `useSortable` calls at all) so
  it never registers duplicate draggable ids alongside the desktop copy in the same
  `DndContext`.
- Project icon is settable in the data model (`projects.icon`) but the context menu only
  exposes a color swatch picker for now; a proper emoji/icon picker is a small follow-up.
- Shift-click range selection isn't implemented for multi-select (checkbox-per-card and
  Cmd/Ctrl+A are); selection only works in grid/focus view, not the compact list view.
- "Undo" on project delete is informational only (no undo action) since restore-from-Trash
  is Phase 6's job; the toast says so. Unlink and move *do* have working one-click undo.
- "Add existing" on a project page lists Inbox (unfiled) items with a client-side title
  filter rather than full-text search, which doesn't exist until Phase 6.
- Verified against the real local Postgres by exercising the DAL/service layer directly
  (project CRUD, cycle rejection, multi-project linking, unlink, move, bulk actions, reparent
  delete) — see git history for the one-off smoke script. Not verified through the actual
  signed-in browser UI: this sandbox has no Google OAuth credentials (same limitation noted
  in Phase 2), so the sidebar DnD and keyboard triage are implemented per the design above
  and unit-tested at the logic layer, but not click-tested end to end.

---

## Phase 4 — Tasks: CRUD, description, checklist, list + board, resource links

### 4.1 Schema and API
- [x] Tables: `tasks`, `task_checklist_items`, `task_resources`, `task_tags`.
- [x] Routes: `GET /api/v1/tasks` (filters: smart filter today/upcoming/overdue/no-date/
  completed, project + descendants, tag, status, priority; group/sort params; cursor),
  `POST`, `GET|PATCH|DELETE /api/v1/tasks/:id`, `POST …/duplicate`, `POST …/archive`,
  checklist CRUD + reorder, `POST|DELETE /api/v1/tasks/:id/resources`,
  `GET /api/v1/resources/:id/tasks`, `POST /api/v1/tasks/bulk-actions`.
- [x] `completed_at` set/cleared automatically on status change.

### 4.2 Quick-add parser (`lib/tasks/quick-add.ts`, unit-tested)
- [x] `chrono-node` for dates/times ("friday 5pm", "tomorrow", "in 3 days", "next mon 9-10am").
- [x] Tokens: `#project` (fuzzy; `#parent/child` for nested), `!low|!medium|!high|!urgent`
  (also `!1`–`!4`), `+tag`. Recurrence phrases ("every weekday") are parsed in Phase 5.
- [x] Live preview chips under the input showing what was recognized; Tab-accept/Escape-ignore.

### 4.3 UI
- [x] Task detail drawer: inline-editable title; **prominent Tiptap description** (headings,
  bold/italic, lists, checklists, links; autosave with debounce); status, priority (color
  cues), dates/all-day, project picker, tags; checklist with progress bar and DnD reorder;
  **Resources** section with searchable picker + "Add new resource" inline, rendered as
  compact cards that expand/play in place; unlink; timestamps.
- [x] Resource detail drawer: "Tasks" section listing linked tasks; link/unlink from there.
- [x] List view: group by status/project/due/priority, sort, inline status toggle.
- [x] Board view: columns To do / In progress / Blocked / Done, dnd-kit between and within
  columns (fractional `sort_key`).
- [x] Smart filters in the sidebar (Today, Upcoming, Overdue, No date, Completed) with counts.
- [x] Bulk select: status, priority, project, tags, delete.
- [x] Keyboard: `Q` quick add, `/` or `Cmd/Ctrl+K` search, `X` toggle done on focused task,
  `?` shortcut sheet.
- [x] Project page: tasks section + progress (done vs total, including descendants).
- [x] Resource cards show linked-task count; library filter "has linked tasks".
- [x] Seed data extended with tasks, checklists and links.

**Done when:** all task fields editable inline with optimistic updates; board DnD persists;
the quick-add example "finish landing page friday 5pm #projectname !high" produces the
right task; resources link both ways and unlinking never deletes; parser tests pass.

**Implementation notes (Phase 4):**
- Task status enum is `todo | in_progress | blocked | done` and priority is
  `low | medium | high | urgent`; both are Postgres enums plus a shared `sort_key`
  (fractional-indexing) column that orders both the list's "manual" sort and the board's
  within/across-column drag, exactly like `projects.sort_key` in Phase 3.
- The task's rich description reuses the Phase 2 note-resource Tiptap editor
  (`components/resources/full-view/note-editor.tsx`) as-is — it already saves JSON + plain
  text generically, so no second editor was built.
- The **Resources** section links *existing* library resources via a searchable popover
  (title-filtered client-side, same convention as `AddExistingDialog`); it does **not** have
  an inline "create a brand-new resource from here" shortcut — use the global Add Resource
  flow, then link it. Linked resources render as compact rows (icon, title, open-original,
  unlink), not full playable embeds — opening the resource's own detail drawer still gives
  the full card.
- Quick-add's `Tab`/`Enter` both submit the task immediately with whatever was parsed —
  there's no separate "accept the suggestion" step, because every chip (`#project`,
  `!priority`, `+tag`, the date span) is derived directly from syntax the user already typed,
  not a predictive autocomplete. `Escape` clears the bar. `#project` only matches single-token
  names (no spaces) by construction, so the project page's inline quick-add passes its project
  in as `defaultProject` instead of pre-filling `#<name with spaces>` into the text.
- dnd-kit's `useSortable` return value can't be read directly in the same component that
  renders the `ref`/`style`/`attributes` (ESLint's `react-hooks/refs` flags it); the checklist
  and board card drag wiring follow the same hook-wrapper/view-component split and optional
  chaining (`drag?.setNodeRef`) that `components/projects/sidebar-tree.tsx` already
  established in Phase 3.
- The board's cross-column drag gives live visual feedback while dragging (via `onDragOver`
  reshuffling local column state) but, like the Phase 3 sidebar tree, computes the final
  fractional sort key only once on drop — there's no persisted "ghost" preview beyond that.
- Smart-filter counts and the project progress bar are each a small dedicated endpoint
  (`GET /api/v1/tasks/smart-counts`, `GET /api/v1/projects/:id/tasks-progress`) rather than
  fetching full task lists just to count them.
- `/` and `Cmd/Ctrl+K` on the Tasks page focus a client-side title filter over the already-
  loaded page (full-text search across the library is Phase 6); `X` toggles done on a
  keyboard-focused row, skipped while bulk-select mode is active (the same key then has no
  per-row meaning).
- Not verified in a real signed-in browser (no Google OAuth credentials in this sandbox —
  same limitation as Phases 1–3). Instead verified end to end against the real local Postgres
  with a one-off DAL-level smoke script (create/update/status-completedAt-toggle/checklist
  add-toggle-reorder-delete/resource link-unlink/reverse lookup/board move/duplicate/bulk
  priority/project-scoped list/project progress/smart counts), run once and then deleted
  rather than kept in the repo. `pnpm build` and `pnpm test` both pass.

---

## Phase 5 — Calendar, recurrence, reminders

### 5.1 Recurrence model (`lib/tasks/recurrence.ts`, unit-tested)
- [ ] A recurring task is a **series master** with an RFC 5545 `rrule` (daily, weekly,
  monthly, custom builder UI) + `exdates`.
- [ ] Occurrences are expanded server-side for the requested range
  (`GET /api/v1/calendar?from&to&filters`), never stored in bulk.
- [ ] Edit "this occurrence" → add `exdate` to the master + create a detached exception
  task (`series_id`, `original_occurrence_at`). Edit "this and following" → end the
  current series with `UNTIL` and start a new series. Edit "all" → update master.
- [ ] Completing an occurrence creates a done exception for that date; the series continues.
- [ ] Quick-add recognizes "every day/weekday/monday/month".

### 5.2 Calendar UI (FullCalendar, themed with tokens)
- [ ] Month, week, day and agenda (list) views; Today button; prev/next; today in orange.
- [ ] Timed tasks with start + due → blocks; due-only → short block at due time;
  all-day → all-day row.
- [ ] Click/drag an empty slot → quick-create popover (prefilled times) → task.
- [ ] Drag to reschedule, drag edges to resize; recurring items ask "this / following / all".
- [ ] Click an item → the same task detail drawer. Checkbox on items to complete; done style
  (strikethrough + dimmed).
- [ ] Color mode selector: project / priority / status (saved in `user_settings`).
- [ ] Filters: project (incl. sub-projects), tag, status.
- [ ] Side panel: Overdue + Unscheduled lists, draggable onto the calendar to schedule.
- [ ] Mobile: defaults to agenda/day view; side panel becomes a bottom sheet.

### 5.3 Reminders
- [ ] `task_reminders` (offsets: at time, 5m, 15m, 1h, 1d, custom).
- [ ] Client polls `GET /api/v1/reminders/due` every 60s and on focus; shows an in-app
  toast + bell list; optional browser `Notification` when permission is granted; dismiss/snooze.

### 5.4 ICS export
- [ ] `GET /api/calendar/[token].ics` subscribable feed (secret token, regenerable in
  Settings) including RRULE/EXDATE; plus one-off `.ics` download.

**Done when:** all four views work; create/drag/resize/complete persist; a weekly series
renders correctly, single-occurrence edits don't affect the rest; unscheduled tasks can be
dragged onto the calendar; reminders fire in-app; the feed imports into Google Calendar.

---

## Phase 6 — Search, tags, trash/undo, export, hardening, polish

### 6.1 Search
- [ ] Generated `tsvector` columns (weighted: title A, tags/metadata B, notes/description/
  extracted text C) on resources, tasks, projects; `pg_trgm` for fuzzy/prefix matches.
- [ ] Text extraction for PDFs (`unpdf`) on upload complete → `extracted_text`.
  (OCR for screenshots is out of scope; noted as a possible extension.)
- [ ] `GET /api/v1/search?q&filters` → results grouped by type (resources, tasks, projects,
  tags) with highlighted snippets (`ts_headline` with sentinel markers, escaped, then
  rendered as `<mark>`; never raw HTML).
- [ ] `Cmd/Ctrl+K` command palette (`cmdk`): search + quick actions (add resource, add
  task, go to project). Full search page with advanced filters: type, tag, project (with
  sub-projects), date range, linked/unlinked to tasks, favorites.

### 6.2 Tags page
- [ ] List with usage counts (resources + tasks), rename, merge (re-point join rows in a
  transaction, dedupe), delete, color.

### 6.3 Trash and undo
- [ ] Trash page: deleted resources, tasks and projects; restore (a project returns to its
  parent if it still exists, else root) or delete permanently; "Empty trash".
- [ ] Permanent delete of a resource → `files` rows marked `deleting` → R2 objects removed
  by job with retries → rows removed.
- [ ] `/api/cron/[job]` (protected by `CRON_SECRET`, wired in `vercel.json`): retry
  metadata jobs, purge trash older than 30 days, delete `pending` uploads older than 24h,
  sweep R2 objects with no DB row (only under the `resource/` prefix, only older than 24h).
- [ ] Consistent undo toasts for delete, unlink, move, status changes.

### 6.4 Export
- [ ] `GET /api/v1/export` → streamed JSON of projects (tree), resources (with snapshots
  and file metadata), tasks (with checklists, links, reminders), tags. One-click from Settings.

### 6.5 Hardening and quality
- [ ] Security headers + CSP (`frame-src` limited to YouTube-nocookie, Instagram,
  platform.twitter.com, Pinterest; `img-src` self + R2 endpoint + https), re-read
  `docs/01-app/02-guides/content-security-policy.md` and `data-security.md`.
- [ ] Rate limits audited on every write and fetch endpoint.
- [ ] Per-user quotas (sign-up is open): total storage bytes (`USER_STORAGE_QUOTA_MB`,
  checked in `POST /api/v1/uploads` and before copying snapshot images), resources created
  per day, metadata fetches per hour. Usage bar in Settings; clear error when a limit is hit.
- [ ] Ownership tests: a second user can't read or mutate the first user's data via any route.
- [ ] Accessibility pass: keyboard-only walkthrough, ARIA labels, focus traps in
  dialogs/drawers, contrast checks, reduced motion.
- [ ] Performance: virtualized lists, image sizes, lazy embeds, bundle check
  (dynamic-import FullCalendar, Tiptap, lightbox), DB `EXPLAIN` for hot queries.
- [ ] Playwright smoke suite: add resource → link to project → create task → link resource
  → schedule on calendar → search finds it → delete → restore.

### 6.6 Deliverables
- [ ] **README**: overview, stack, local setup (Docker PG, Google OAuth client, R2 bucket +
  CORS + API token), migrations, seed, scripts, deployment (Vercel + Neon + R2, cron),
  capture setup (bookmarklet, Android share, iOS Shortcut), keyboard shortcuts.
- [ ] **Environment variables** table (below), mirrored in `.env.example`.
- [ ] **Seed/demo data** covering every feature (nested projects, every resource type,
  tasks with recurrence/reminders/checklists, tags, a trashed item).
- [ ] **`docs/EMBEDS.md`** finalized (limitations below, plus anything found while building).

**Done when:** search across everything with highlights; tags rename/merge; trash restore
and permanent delete (including R2 objects); export downloads; Playwright suite green;
README lets a fresh clone run in under 15 minutes.

---

# Extra phases (7–13)

Phases 1–6 are the core product. Everything below is additive: each phase ships on its
own, follows the same working agreement (section 7), and is only started on request. The
one hard dependency chain is **7 → 8 → 9**: text has to exist before it can be embedded,
and retrieval has to work before an assistant is worth having. Phases 10–13 can be pulled
forward in any order.

## Should search be semantic, and should the app use AI?

Yes to both, as a layer on top of Phase 6 search, not a replacement.

- **Why keyword search alone falls short here.** Most of this library is visual or
  short-text: reels, pins, tweets, screenshots, videos. A reel saved as "instagram.com/reel/…"
  has almost no words to match. Postgres FTS only finds what was literally typed into a
  title, tag or note, so the more you save without organizing, the less findable it gets.
- **Why semantic search alone also falls short.** Vector search misses exact strings (a
  repo name, an error code, a URL fragment) that FTS nails. The answer is **hybrid**:
  run both and fuse the rankings.
- **The real prerequisite is content, not vectors.** Embedding a bare URL is useless. The
  win comes from first capturing what each resource _says_ (article text, video
  transcript, README, an AI description of an image) and summarizing it. That alone
  improves keyword search before any vector exists, which is why Phase 7 comes first.
- **AI should suggest, never silently reorganize.** Tags, projects and tasks proposed by
  a model appear as one-key accept/dismiss chips and are undoable.

## Decisions for the extra phases

| Concern | Choice | Why |
| --- | --- | --- |
| LLM provider | **DeepSeek** by default, **Kimi (Moonshot)** as the alternative; both through one OpenAI-compatible client (`openai` SDK with a configurable `baseURL`) in `lib/server/ai/client.ts` | Both speak the OpenAI Chat Completions format, so switching is an env change. Model IDs come from env because they change often |
| Text model | `deepseek-flash` for enrichment, query parsing and digests; `deepseek-v4-pro` (or `kimi-k3`) for the Phase 9 assistant | Flash is about $0.15–0.30 / $0.60–1.20 per 1M tokens in/out with a 1M context, JSON output and tool calls. The assistant benefits from the stronger model |
| Vision model | `deepseek-flash` (image input) with `kimi-k2.6` as fallback | Needed to describe screenshots, pins and reel thumbnails. `deepseek-v4-pro` has no image input, so vision calls always go to a vision-capable model |
| Embeddings | **Voyage AI `voyage-4-lite`**, 1024 dimensions, behind `lib/server/ai/embeddings.ts` | The one job DeepSeek and Kimi can't do: neither offers an embeddings endpoint. Voyage is $0.02 per 1M tokens with 200M tokens free. Alternative with no third provider: a small local model via `@huggingface/transformers`, but it is slow to cold-start on serverless |
| Vector store | `pgvector` in the same Postgres, `halfvec(1024)` | No new service; Neon supports it; vector, FTS and `user_id` filters live in one SQL query |
| Rank fusion | Reciprocal Rank Fusion (`1 / (60 + rank)` per arm) | Needs no score normalization between FTS and vector distances |
| Structured output | `response_format: json_object` + Zod validation, one retry, then mark the job `skipped` | DeepSeek has JSON mode but no strict schema enforcement, and documents occasional empty responses |
| Background work | Existing `jobs` table + cron. Backfills run in DeepSeek's off-peak window (half price) or Kimi's Batch API (60% of list) | Nothing new to operate |
| Cost control | `ai_usage` table with a per-user daily token budget; every AI feature is hidden when no key is configured | Sign-up is open, so the server's key needs a ceiling per account |
| Privacy | Settings → AI: global on/off and a per-resource "exclude from AI"; the settings page names the provider the content is sent to | Saved notes and files can be personal; DeepSeek and Moonshot process data on servers in China, which users should be told |
| Untrusted content | Fetched page text is data, never instructions: it is passed as quoted context, and any write action proposed by a model needs a click to confirm | A saved web page can contain prompt-injection text |

Rough cost with `deepseek-flash`: enriching one resource (~3k tokens in, ~400 out) is
about **$0.001**, so 1,000 resources cost around a dollar. Embedding the same 1,000
resources is a few million tokens, inside Voyage's free allowance. These are estimates
from list prices on 2026-10-03; re-check before building.

---

## Phase 7 — Content understanding (the AI enrichment pipeline)

**Goal:** every resource knows what it is about: captured text, a short summary, and
suggested tags and project, without the user typing anything.

### 7.1 Text capture (no AI yet)
- [ ] Articles and generic links: reader-mode extraction (`@mozilla/readability` +
  `linkedom`) from the HTML the SSRF-guarded fetcher already downloads → `extracted_text`;
  sanitized article HTML stored in R2 for the Phase 10 reader.
- [ ] YouTube: caption transcript with timestamps when one exists (there is no official API
  for other people's captions, so this is best-effort and falls back to
  description + chapters from the Data API).
- [ ] X: post text from oEmbed. GitHub: README (capped). PDFs: `unpdf` (from 6.1). Notes: body text.
- [ ] `content_status` (none/pending/ok/failed) on `resources`; "Re-extract" action.

### 7.2 Enrichment job (`jobs.kind = 'enrich'`)
- [ ] Images, Instagram and Pinterest (thumbnail): one vision call → description + any
  visible text. This is the "OCR for screenshots" item from the old backlog.
- [ ] One JSON call per resource →
  `{ summary, keyPoints[], suggestedTags[], suggestedProjectId, kind, language, estMinutes }`
  (`kind`: tutorial, tool, article, inspiration, reference, discussion, …).
- [ ] The system prompt + the user's tag list + project tree form a stable prefix (provider
  prefix caching makes repeats cheap), so suggestions reuse existing tags instead of
  inventing near-duplicates.
- [ ] Stored in `resource_ai` with an `input_hash`; re-run only when the input changes.
- [ ] `ai_usage` metering and the per-user daily budget; over budget → job waits for tomorrow.
- [ ] "Enrich my library" backfill, scheduled into the off-peak window.

### 7.3 UI
- [ ] Summary + key points in the detail drawer and on card hover; estimated read/watch time.
- [ ] Suggestion chips (tags, project): accept with one key, dismiss, "accept all". Optional
  "auto-apply suggested tags" (off by default); AI-applied tags are marked and bulk-revertible.
- [ ] Inbox triage (Phase 3 J/K flow) pre-selects the suggested project: Enter accepts.
- [ ] Settings → AI: on/off, auto-apply, usage this month, provider disclosure.
- [ ] `extracted_text` and `summary` feed the Phase 6 `tsvector` (weight C).

**Done when:** a saved article, video, repo, tweet and screenshot each get a summary and
sensible tag suggestions within a minute; keyword search finds a video by something said in
it; AI can be switched off per user and per resource; budget exhaustion degrades quietly.

---

## Phase 8 — Semantic and hybrid search

**Goal:** find things by meaning ("that video about making dark dashboards feel premium")
while exact matches still win.

### 8.1 Indexing
- [ ] Enable `vector` (local Docker image → `pgvector/pgvector:pg16`; Neon: `CREATE EXTENSION`).
- [ ] `search_chunks`: `id`, `user_id`, `entity_type` (resource/task/project/highlight),
  `entity_id`, `ordinal`, `content`, `start_seconds`, `embedding halfvec(1024)`,
  `embedding_model`, `content_hash`.
- [ ] Chunking: short items (tweet, pin, note, task) are one chunk of title + summary +
  tags + text. Long items (articles, transcripts, PDFs, READMEs) split at ~600 tokens with
  overlap, each chunk prefixed with the title and one-line summary so it makes sense alone.
  Transcript chunks keep their start time.
- [ ] `embed` job on create/update when `content_hash` changes; chunks removed on permanent delete.
- [ ] Start with **exact** nearest-neighbour search filtered by `user_id` (one person's
  library is small, and exact search has perfect recall). Add an HNSW index
  (`halfvec_cosine_ops`, iterative scan for filtered queries) when a user passes ~50k chunks.

### 8.2 Query
- [ ] `GET /api/v1/search?mode=hybrid`: FTS arm + vector arm → RRF → group chunks by entity →
  best chunk becomes the snippet. Trigram title/URL matches get a boost.
- [ ] Query-embedding cache; automatic fallback to FTS-only if the embedding API is down or
  the budget is spent.
- [ ] Natural-language filters: "github repos about auth I saved last month" → the same
  filter schema as the search page (type, date range, project, tags) + a semantic
  remainder, shown as editable chips. Runs only on Enter in full search, never per keystroke.
- [ ] Optional later: a reranker over the top 50; image embeddings
  (`voyage-multimodal-3.5`) for visual similarity if caption-based search proves weak.

### 8.3 UI
- [ ] `Cmd/Ctrl+K`: instant FTS results first, then a "Related by meaning" group merges in.
- [ ] Result snippet shows the passage that matched; YouTube results open at that timestamp.
- [ ] "More like this" on any card; **Related** panel in the resource drawer.
- [ ] Task drawer: "Resources that might help" with one-click link. Project page: "Unfiled
  items that fit this project".
- [ ] Add dialog: near-duplicate warning (same content, different URL).
- [ ] Search eval: a golden set of queries over the seed data, recall@10 for FTS vs hybrid,
  run in CI so ranking changes are measured rather than guessed.

**Done when:** a resource is findable by a paraphrase that shares no words with its title;
exact-name queries still rank the exact item first; hybrid beats FTS on the eval set; search
keeps working with the embedding provider unreachable.

---

## Phase 9 — AI assistant

**Goal:** ask questions of your own library and let it do the filing and planning chores.

- [ ] `POST /api/v1/ai/chat` (streaming) with tool calls. Read tools: `search_library`
  (Phase 8 hybrid), `get_resource`, `list_projects`, `list_tasks`, `get_calendar`. Write
  tools: `create_task`, `update_task`, `link_resource`, `add_tags`, `move_resource`,
  `create_project`. Every tool goes through the DAL with the session's `userId`; the model
  never supplies a user id.
- [ ] Write tools return a **proposed change** that the user confirms in the UI (with undo).
  No tool fetches arbitrary URLs.
- [ ] Assistant panel (right drawer / full page): scope selector (whole library, this
  project + sub-projects, selected items). Answers cite resources, rendered as the same
  compact playable cards; video citations jump to the timestamp.
- [ ] One-click actions outside chat:
  - **Project brief:** synthesize a project's resources and tasks into a summary + gaps.
  - **Plan from this resource:** tutorial or video → a task with a checklist (preview → create).
  - **Compare:** selected resources → comparison table (repos, tools, articles).
  - **Inbox autopilot:** propose project + tags for every Inbox item, review as a list, "Accept all".
  - Quick-add fallback: when the deterministic parser recognizes nothing, ask the model.
- [ ] **Weekly review** (cron): what you saved, grouped by project; stale Inbox items; tasks
  due next week; three older items worth another look. In-app page, optional email.
- [ ] `ai_threads`, `ai_messages`; long threads are summarized to stay within budget.

**Done when:** "what did I save about X?" returns a cited answer from the user's own
resources; "turn this video into tasks" produces an editable checklist; nothing is written
without confirmation; a second user's data is never reachable through any tool.

---

## Phase 10 — Reader, highlights, archive, link health

**Goal:** saved things stay readable and usable even after the original changes or dies.

- [ ] **Reader view** for articles (the sanitized HTML captured in 7.1): clean typography,
  reading progress, resume position, "Listen" via the browser's built-in speech synthesis.
- [ ] **Highlights:** select text → highlight (color + note) in the reader, PDFs, notes
  and transcripts. `highlights` table with a text-quote anchor (exact + prefix/suffix) or
  `start_seconds`. Highlights page; highlights are searchable and embedded; Markdown export.
- [ ] **Video notes:** transcript panel with click-to-seek; press `N` while playing to drop
  a timestamped note; resume where you left off.
- [ ] **Page archive** (opt-in, counts toward the storage quota): full-page screenshot + PDF
  via Cloudflare Browser Rendering (already on Cloudflare for R2; avoids shipping Chromium
  in a serverless function), stored under `resource/u/<userId>/…` with `files.role = archive`.
  Free fallback: record the Wayback Machine snapshot URL when one exists.
- [ ] **Link health:** weekly cron re-checks URLs through the SSRF guard (rate-limited per
  host) → `link_status` (ok/redirected/dead), `link_checked_at`. Badge on cards, "Broken
  links" filter, "Open archived copy".

**Done when:** an article reads fully in-app with highlights that survive a refresh; a dead
link is flagged and its archived copy opens; a YouTube note jumps to its moment.

---

## Phase 11 — Capture everywhere: extension, imports, feeds, rules

**Goal:** getting things in takes one action from anywhere, and existing collections move over.

- [ ] **Browser extension** (MV3, Chrome + Firefox, `extension/` package): popup save with
  project and tag pickers; context menu (save link, image, selection as a highlight);
  keyboard shortcut; "already saved" badge. Auth with a personal token.
- [ ] **Importers** (`/settings/import`), all through the bulk-create path (dedupe, jobs):
  - Bookmarks HTML (Chrome, Firefox, Safari, Pocket, Raindrop, Karakeep, Linkwarden exports):
    folders → nested projects, tags and original dates preserved.
  - CSV (Raindrop, Pocket, Instapaper).
  - GitHub stars (API). YouTube playlists and Liked videos (incremental Google scope
    `youtube.readonly`, since sign-in is already Google).
  - X bookmarks: paste links or upload the data archive (no free API).
  - Dry-run preview with counts, resumable, and "undo this import" (`import_id` on resources).
- [ ] **Feeds:** subscribe to RSS/Atom, YouTube channels, GitHub releases. Cron polls with
  conditional GET; new entries land in the Inbox tagged with the feed, or go straight to a project.
- [ ] **Rules:** when (type, domain, URL pattern, tag, feed, text contains) → then (add to
  project, tag, favorite, mark reviewed, skip Inbox). Run on create; "run on existing" with
  a dry-run count.
- [ ] Optional mobile paths for iOS, where there is no share target: a Telegram bot and an
  email-in address (Cloudflare Email Routing → the capture endpoint).

**Done when:** the extension saves the current tab into a chosen project in two clicks; a
browser bookmarks file imports with its folder tree intact and can be undone; a rule files
every GitHub repo automatically; a subscribed channel's new video appears in the Inbox.

---

## Phase 12 — Rediscover, smart collections, push, offline, insights

**Goal:** the library works for you after the save, instead of becoming a graveyard.

- [ ] **Rediscover:** a daily handful chosen from unreviewed items older than 30 days,
  favorites not opened in 90 days, items related to tasks due this week or active projects
  (Phase 8; falls back to tag/project overlap), and "on this day". Each card: keep, file,
  snooze, delete.
- [ ] `last_opened_at`, `open_count` on resources; "Never opened" filter and sort.
- [ ] **Smart collections:** save any search (filters + optional semantic query) as a
  sidebar item with a live count.
- [ ] **Highlight review:** spaced resurfacing of highlights (simple Leitner intervals; needs Phase 10).
- [ ] **Web Push reminders:** service worker + VAPID (`web-push`), `push_subscriptions`;
  cron sends due reminders so they fire with the app closed. (Phase 5 reminders only fire
  while a tab is open.) iOS requires the installed PWA.
- [ ] **Offline:** cache the shell and the last library page; an offline capture queue
  (IndexedDB + Background Sync) so a share on a bad connection is never lost.
- [ ] **Insights:** saves per week by type, Inbox age, task completion, top tags and
  projects, storage and AI usage.

**Done when:** a reminder arrives as a system notification with no tab open; a link shared
offline appears once back online; a smart collection updates as matching items are added.

---

## Phase 13 — Sharing, collaboration, MCP, integrations

**Goal:** the hub connects to other people and other tools.

- [ ] **Share links:** public read-only page for a resource or a project (`/s/<token>`):
  unguessable token, optional expiry, `noindex`, revocable; private notes excluded unless
  opted in; files served through token-scoped signed URLs.
- [ ] **Project collaboration:** invite another account as viewer or editor
  (`project_members`). This changes DAL authorization from "owner" to "member with role"
  and is the largest change in the plan: it gets its own ownership test suite and should be
  decided on separately.
- [ ] **MCP server** (`/api/mcp`, Streamable HTTP, token auth): `search_library`,
  `get_resource`, `add_resource`, `list_projects`, `list_tasks`, `create_task`. Reuses the
  Phase 9 tool layer, so assistants like Claude, ChatGPT or Cursor can search and add to
  the hub.
- [ ] **Public API + webhooks:** OpenAPI generated from the Zod schemas; webhooks on
  resource/task created/updated.
- [ ] **Google Calendar:** one-way push of tasks first (incremental scope), two-way sync after.
- [ ] **Markdown / Obsidian export:** a zip of resources as Markdown with frontmatter,
  highlights and tasks, alongside the Phase 6 JSON export.

**Done when:** a shared project opens signed-out and stops working when revoked; an MCP
client can find and add a resource; a task shows up in Google Calendar.

---

## Extra phases → data model additions

| Table / column | Key columns | Phase |
| --- | --- | --- |
| `resources` (new columns) | `content_status`, `link_status`, `link_checked_at`, `last_opened_at`, `open_count`, `ai_excluded`, `import_id` | 7 / 10 / 11 / 12 |
| `resource_ai` | `resource_id` PK, `summary`, `key_points` jsonb, `suggestions` jsonb, `kind`, `language`, `est_minutes`, `model`, `input_hash` | 7 |
| `ai_usage` | `user_id`, `day`, `feature`, `input_tokens`, `output_tokens` | 7 |
| `user_settings` (new columns) | `ai_enabled`, `ai_auto_apply_tags`, `archive_enabled` | 7 / 10 |
| `search_chunks` | see 8.1 | 8 |
| `ai_threads`, `ai_messages` | `id`, `user_id`, `scope` jsonb; `thread_id`, `role`, `content` jsonb | 9 |
| `highlights` | `id`, `user_id`, `resource_id`, `anchor` jsonb, `text`, `note`, `color`, `review_due_at` | 10 / 12 |
| `imports` | `id`, `user_id`, `source`, `status`, `counts` jsonb | 11 |
| `feeds` | `id`, `user_id`, `url`, `kind`, `target_project_id`, `etag`, `last_polled_at` | 11 |
| `rules` | `id`, `user_id`, `conditions` jsonb, `actions` jsonb, `sort_key`, `enabled` | 11 |
| `saved_searches` | `id`, `user_id`, `name`, `query` jsonb, `sort_key` | 12 |
| `push_subscriptions` | `id`, `user_id`, `endpoint`, `keys` jsonb | 12 |
| `shares` | `id`, `user_id`, `entity_type`, `entity_id`, `token_hash`, `expires_at`, `revoked_at` | 13 |
| `project_members` | PK(`project_id`, `user_id`), `role` | 13 |

## Extra phases → environment variables

All optional: a feature is hidden when its variables are missing.

| Variable | Phase | Purpose |
| --- | --- | --- |
| `AI_PROVIDER` | 7 | `deepseek` (default) or `kimi` |
| `AI_BASE_URL` / `AI_API_KEY` | 7 | OpenAI-compatible endpoint + key (`https://api.deepseek.com` or `https://api.moonshot.ai/v1`) |
| `AI_MODEL` / `AI_VISION_MODEL` / `AI_CHAT_MODEL` | 7 / 9 | Defaults `deepseek-flash` / `deepseek-flash` / `deepseek-v4-pro` |
| `AI_DAILY_TOKEN_BUDGET` | 7 | Per-user daily cap |
| `EMBEDDING_API_KEY` / `EMBEDDING_MODEL` / `EMBEDDING_DIMENSIONS` | 8 | Voyage key, `voyage-4-lite`, `1024` |
| `CF_BROWSER_RENDERING_TOKEN` | 10 | Page screenshots and PDFs |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | 12 | Web Push |
| `RESEND_API_KEY` | 9 / 12 | Optional email for the weekly review |

## Extra phases → risks

| Risk | Mitigation |
| --- | --- |
| Model output isn't valid JSON, or comes back empty | Zod validation, one retry, then `skipped`; the card simply shows no suggestions |
| Provider model IDs and prices change | IDs and base URL live in env; one client module; embeddings store `embedding_model` so a re-embed is a background job |
| Prompt injection from saved pages | Content is quoted context only; write tools need user confirmation; no URL-fetching tool; tools are `userId`-scoped in the DAL |
| AI spend with open sign-up | Per-user daily budget, off-peak backfills, enrichment only on content change (`input_hash`) |
| Unofficial transcript and scraping endpoints break | Best-effort with fallbacks; failures never block saving |
| Semantic search quality is unclear | The eval set in 8.3 decides, not intuition; FTS remains the baseline and the fallback |
| Collaboration breaks the "everything is `user_id`-scoped" rule | Kept last, behind its own design review and ownership test suite |

---

## 4. Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | Postgres connection string |
| `BETTER_AUTH_SECRET` | yes | Session signing secret (32+ random bytes) |
| `BETTER_AUTH_URL` | yes | App base URL (e.g. `http://localhost:3000`) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | yes | Google OAuth client (redirect `…/api/auth/callback/google`) |
| `R2_ACCOUNT_ID` | yes | Cloudflare account ID (endpoint `https://<id>.r2.cloudflarestorage.com`) |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | yes | R2 API token (object read/write on the bucket) |
| `R2_BUCKET` | yes | Private bucket name |
| `UPLOAD_MAX_IMAGE_MB` / `UPLOAD_MAX_FILE_MB` | no | Upload limits (defaults 20 / 50) |
| `USER_STORAGE_QUOTA_MB` | no | Per-user storage cap (Phase 6.5, default 1024) |
| `CRON_SECRET` | yes (prod) | Protects `/api/cron/*` |
| `GITHUB_TOKEN` | no | Higher GitHub API rate limit |
| `YOUTUBE_API_KEY` | no | Published date / duration for YouTube |
| `META_OEMBED_TOKEN` | no | Instagram oEmbed (`app_id|client_token`) |
| `SEED_USER_EMAIL` | no | Target user for `pnpm db:seed` |

Variables added by the extra phases are listed in "Extra phases → Environment variables".

---

## 5. Known platform embed limitations (seed for `docs/EMBEDS.md`)

- **Instagram:** public posts/reels embed through `instagram.com/p/<code>/embed`. Private
  or deleted posts render Instagram's own "unavailable" frame, and a cross-origin iframe
  can't report that reliably, so we use a load timeout plus a manual "Embed not working"
  toggle, and mark `embed_status = unavailable` when a metadata refresh gets a 404.
  Metadata needs a Meta app token (oEmbed) and is often minimal without it; OG tags are
  frequently behind a login wall. Manual override and uploading a screenshot as thumbnail
  are the fallback. We can't pause Instagram playback programmatically, so "one video at a
  time" is enforced by resetting the iframe.
- **YouTube:** reliable. Pausing works through the IFrame Player API. Published date and
  duration need an API key; oEmbed alone gives title, channel and thumbnail.
- **X:** oEmbed + `widgets.js` are official and unauthenticated, but engagement counts and
  media details are not in oEmbed; counts need the paid API. The snapshot stores text,
  author, date and the oEmbed HTML (sanitized) for fallback rendering. Deleted tweets
  render from the snapshot.
- **GitHub:** unauthenticated API is limited to 60 req/hour; set `GITHUB_TOKEN`.
- **Pinterest:** no stable public metadata API; OG tags work for most public pins.
- **Generic:** some sites block bots or need JS rendering; those fall back to a plain link
  card. We send a clear user agent, fetch only on user action/refresh, and never crawl.
- **Share sheet:** Web Share Target works on Android (installed PWA) but not iOS Safari;
  iOS uses a Shortcut posting to the capture endpoint with a personal token.

---

## 6. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Embed scripts (X, Pinterest, Instagram) slow pages | Click-to-load facades, IntersectionObserver mounting, one script loader per platform |
| Recurrence edge cases (DST, all-day, exceptions) | Store rrule with timezone, expand with `rrule` in user tz, focused unit tests |
| Serverless background work is lost | `after()` for the fast path, `jobs` table + cron for retries |
| R2 orphans from abandoned uploads | `pending` status + 24h sweep, key prefix per user (`resource/u/<userId>/…`) |
| Open sign-up: strangers fill storage or burn API budget | Per-user storage and rate quotas (6.5), per-user daily AI budget (Phase 7), AI features off when no key is set |
| Scope creep in a large spec | Each phase has explicit "done when" criteria; extras live in phases 7–13 and are only started on request |

## 7. Working agreement for implementation

1. At the start of each phase: re-read this section of the plan + relevant Next 16 docs,
   then mark the phase `[~]`.
2. Build in small, runnable commits (schema → API → UI → tests).
3. End of phase: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`, manual smoke
   test on desktop and phone widths, update seed + README, tick the checkboxes, mark `[x]`.
4. Review together before starting the next phase.

## Backlog (not in scope unless requested)

Everything that used to be listed here (OCR for screenshots, browser extension, offline
mode, sharing, AI summaries/auto-tagging, Google Calendar sync) now has a home in the
extra phases 7–13. Still unplanned: native mobile apps, text-to-speech with a hosted
voice model, a graph view of related resources, team workspaces with billing.
