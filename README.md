# Resource Hub

A personal hub for everything you save online. Links are rendered
richly and play inline (YouTube, Instagram, X, GitHub, Pinterest, any URL),
alongside notes and uploaded files. Projects, tasks and a calendar come in
later phases (see [`PLAN.md`](./PLAN.md)).

**Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4,
shadcn/ui on Base UI, Better Auth (Google only), Drizzle ORM + Postgres,
TanStack Query, Cloudflare R2, Tiptap.

## Local setup

Requirements: Node 22+, pnpm, Docker.

```bash
pnpm install
cp .env.example .env          # then fill it in (see below)
docker compose up -d          # Postgres 16 on localhost:5433
pnpm db:migrate
pnpm dev                      # http://localhost:3000
```

### Google OAuth

1. In Google Cloud Console, create an **OAuth client ID** (type: Web application).
2. Add the authorized redirect URI `http://localhost:3000/api/auth/callback/google`
   (and your production URL's equivalent).
3. Put the client ID and secret in `.env`. Any Google account can sign in;
   each account gets its own private library.

### Cloudflare R2 (uploads and thumbnail snapshots)

Without R2 the app still works, but uploads return "storage not configured"
and cards use the remote snapshot images directly.

1. Create a **private** bucket. Never enable public access; files are only
   reachable through short-lived signed URLs behind `/api/files/:id`.
2. Create an R2 API token with _Object Read & Write_ on that bucket. Set
   `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` and `R2_BUCKET`.
3. Add a CORS policy so the browser can PUT directly to R2:

```json
[
  {
    "AllowedOrigins": ["http://localhost:3000", "https://your-domain.example"],
    "AllowedMethods": ["PUT", "GET"],
    "AllowedHeaders": ["content-type"],
    "MaxAgeSeconds": 3600
  }
]
```

Objects are stored as `resource/u/<userId>/<fileId>/<name>`, so everything the
app writes stays under the `resource/` prefix of the bucket.

## Environment variables

| Variable                                                                 | Required       | Purpose                                            |
| ------------------------------------------------------------------------ | -------------- | -------------------------------------------------- |
| `DATABASE_URL`                                                           | yes            | Postgres connection string                         |
| `BETTER_AUTH_SECRET`                                                     | yes            | Session signing secret (`openssl rand -base64 32`) |
| `BETTER_AUTH_URL`                                                        | yes            | App base URL, e.g. `http://localhost:3000`         |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`                              | yes            | Google OAuth client                                |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | for uploads    | Cloudflare R2                                      |
| `UPLOAD_MAX_IMAGE_MB` / `UPLOAD_MAX_FILE_MB`                             | no             | Upload limits (defaults 20 / 50)                   |
| `CRON_SECRET`                                                            | prod (Phase 6) | Protects `/api/cron/*`                             |
| `GITHUB_TOKEN`                                                           | no             | Higher GitHub API rate limit                       |
| `YOUTUBE_API_KEY`                                                        | no             | YouTube published date and duration                |
| `META_OEMBED_TOKEN`                                                      | no             | Instagram oEmbed (`app_id\|client_token`)          |
| `SEED_USER_EMAIL`                                                        | no             | Target account for `pnpm db:seed`                  |

The server validates these at boot (`lib/env.ts`) and fails with a list of
what's missing.

## Scripts

| Script                                         | What it does                                                                      |
| ---------------------------------------------- | --------------------------------------------------------------------------------- |
| `pnpm dev` / `pnpm build` / `pnpm start`       | Next.js                                                                           |
| `pnpm lint` / `pnpm typecheck` / `pnpm format` | Code quality                                                                      |
| `pnpm test`                                    | Vitest unit tests (URL detection, normalization, SSRF guard)                      |
| `pnpm test:e2e`                                | Playwright smoke tests (run `pnpm exec playwright install chromium` once)         |
| `pnpm db:generate`                             | Generate a migration from `lib/db/schema`                                         |
| `pnpm db:migrate`                              | Apply migrations                                                                  |
| `pnpm db:studio`                               | Drizzle Studio                                                                    |
| `pnpm db:seed`                                 | Demo data (one resource of every type) for `SEED_USER_EMAIL`. Sign in once first. |

Empty Library and Inbox pages also have a **Load demo data** button.

## Capture

- **Bookmarklet:** Settings → Capture. Drag the button to your bookmarks bar.
- **Android:** install the PWA from Chrome. "Resource Hub" then appears in the
  share sheet (Web Share Target → `/capture`).
- **iOS:** Safari has no share target. Create a personal token in Settings,
  then build a Shortcut that POSTs `{"url": <Shortcut Input>}` to
  `/api/v1/capture` with `Authorization: Bearer <token>`.

Captured items land in the Inbox; a URL you already saved returns the existing
resource instead of creating a duplicate.

## Architecture notes

- `proxy.ts` (Next 16's middleware) only does an optimistic cookie check.
  Real authorization happens in every page (`requireUser`) and route handler
  (`requireApiUser`).
- All data access goes through `lib/server/dal/*`, which takes `userId` as a
  required argument.
- Metadata is fetched after the response (`after()`), so bulk adds return
  instantly. Retryable failures go to the `jobs` table with exponential
  backoff (30 s, 2 min, 8 min); after that the card falls back to a plain
  link with **Retry**.
- Platform-specific embed limitations are documented in
  [`docs/EMBEDS.md`](./docs/EMBEDS.md).
