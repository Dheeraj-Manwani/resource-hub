# Visible authenticated browser tests

```powershell
pnpm install
pnpm exec playwright install chromium
pnpm run test:e2e:headed
```

The headed command opens visible Chromium windows, runs one test at a time,
and slows browser actions by 250 ms so you can follow the walkthrough. For
interactive selection and reruns, use `pnpm run test:e2e:ui`. For headless
desktop CRUD plus desktop/mobile signed-out checks, use `pnpm run test:e2e`.
Inspect the last HTML report with `pnpm exec playwright show-report`.

The runner uses `http://localhost:3000`, reusing your local development server
when it is running. Otherwise it starts its own server with a separate
`.next-e2e` build directory. `.env` is loaded first, then `.env.local` overrides it. Set `DATABASE_URL` to a migrated test database
(recommended), and provide the usual application environment variables from
`.env.example`. `BETTER_AUTH_URL` is overridden for the test server. You can
choose another local port with `E2E_PORT`. No production URL is accepted.

Each authenticated test creates a unique `playwright-…@example.invalid`
account, signs it in through Better Auth with a generated password, and passes
its signed session cookie to the browser. Password sign-in exists only in the
test runner's Better Auth instance; the application keeps Google-only login.
The external Google consent screen is not automated. The visible walkthrough
verifies the signed-in email, then performs the app's real UI/API/database
flows. CRUD responses are not mocked. Onboarding is marked seen for this
account so the tour does not obscure the walkthrough.

Coverage includes:

- Project create, name/description edit, sub-project creation, deletion and restore.
- Note resource create, title/notes edit, tag creation, project link/unlink and deletion.
- Single URL and bulk URL capture, bulk selection/delete, optimistic Favorite,
  and the global Syncing indicator while a real write waits.
- Task create, title/status/project edit, checklist add/edit/complete/delete,
  reminder add/delete, and resource link/unlink.
- Rich-text quick note create/edit/project assignment/delete.
- Tag rename, color change and delete.
- API token create/revoke.
- Search results and completing a task from Calendar, including persistence.
- Real image/document uploads, title edits and permanent file deletion (when R2 is configured).
- Trash restore for resources/tasks/projects, permanent deletion and Empty Trash.
- Reload checks for persisted edits, account menu, logout and access protection.
- Desktop/mobile landing, sign-in errors, unauthorized APIs and PWA manifest.

Teardown deletes only the exact generated user ID and email, with foreign-key
cascades removing its related records, then verifies the account is gone.
This also runs when a test fails normally. If you forcibly kill the process,
the generated account may remain; its email is printed in the terminal. Never
point the runner at an account you use for work.

File uploads require configured R2 storage and are covered separately when
those credentials are available. The bucket's CORS must allow the test origin
(the current bucket allows `http://localhost:3000`; changing `E2E_PORT` requires
allowing that origin too). Teardown also removes remaining uploaded objects
under the exact test user's storage prefix if a test fails. External platform
embeds and Google consent are integration boundaries, not mocked successes in this CRUD walkthrough.
Screenshots and traces are retained on failure under ignored `test-results/`;
they can contain test session details, so do not publish them.

Verified locally on 2026-10-05: the desktop CRUD, link/syncing and real upload
journeys passed in headed Chromium; the complete desktop/mobile suite passed
all 13 tests. TypeScript and lint checks for the test/config files passed.
