# RenxZero Notes

A responsive university knowledge base for **FOA, OS, IWT, DBMS and OOP**. Built with Next.js App Router, TypeScript, React, Supabase/SQLite, Markdown, KaTeX and highlighted code.

**Publish on Vercel:** follow [DEPLOY-VERCEL.md](DEPLOY-VERCEL.md). This version includes cloud storage and free-tier Groq configuration.

## Run locally

Requires **Node.js 24.x** and npm.

```sh
npm ci
```

Copy `.env.example` to `.env.local` and set `ADMIN_PASSWORD` to your own password of at least 12 characters. No AI account or database service is needed.

```sh
npm run dev
```

Open **http://127.0.0.1:3000**. Select **Manage notes** to sign in. There is no hard-coded production password. Without an admin password, reading works and administrator login stays disabled.

Production:

```sh
npm run build
npm start
```

The default scripts bind to the local machine. To expose a hosted instance, configure the server host and HTTPS reverse proxy deliberately.

## Included

- Publish-success notification with **Back to notes** and **New note** actions.
- Subject PDF libraries with admin upload/delete and reader downloads (4 MB per PDF). Run `supabase/resources.sql` for cloud storage; see [UPDATE-RESOURCES.md](UPDATE-RESOURCES.md) for an existing deployment.

- **Courses, semesters and subjects are managed in the app** (Manage → Courses & subjects): add a course such as IS, add semesters, add subjects. Readers pick their semester in the sidebar. Run `supabase/curriculum.sql` once; see [UPDATE-CURRICULUM.md](UPDATE-CURRICULUM.md).
- **Installable offline app (PWA):** install from Chrome on Android, read notes offline, get asked before notes update, and save PDFs/files for offline use on request. See [UPDATE-PWA.md](UPDATE-PWA.md).
- Per-subject **Storage** page with nested folders and file uploads (PDF, images, Office files, ZIP); admins manage, readers browse and download. Run `supabase/storage.sql`; see [UPDATE-STORAGE.md](UPDATE-STORAGE.md).
- Overview with five subject cards, lesson counts and reading progress.
- Subject pages, tag filters, global full-text search and shareable note routes.
- Reading view with subject/topic navigation, table of contents, math, code, and completion toggle.
- Responsive layout, mobile navigation, dark/light mode and keyboard-accessible review dialogs.
- Password-protected note creation, updates, deletion, draft storage and explicit publishing.
- Markdown source with live preview; GFM tables, fenced code blocks and `$inline$` / `$$display$$` math. Raw HTML is not executed.
- Editable original-versus-improved review. Accepting a suggestion only changes the editor; saving or publishing is a separate action.
- FOA's first lesson seeded once, including all requested algorithm and complexity concepts. Other subjects intentionally start empty.

## Data and backups

With no Supabase variables, notes persist in `data/renxzero.sqlite`, created automatically. With Supabase configured, notes use the cloud database; Vercel requires Supabase and never falls back to local files. The repository seeds FOA only on the first initialization; deleting that lesson does not resurrect it. `DATABASE_PATH` can point to a different absolute file path.

SQLite is suitable for a first version running as a single Node process on a machine with durable disk. It is not suitable for stateless serverless hosting or multiple independent replicas. Stop the app before backing up the `data/` directory, or use SQLite's online backup facility. Never commit the database or `.env.local`.

Reading progress and theme are device-local browser preferences. They do not synchronize across browsers or users. Notes are server-side and shared by everyone viewing this instance. Readers see only published notes; authenticated admins also see drafts.

## AI provider

By default **Improve with AI** uses a clearly labeled local formatting fallback. It normalizes line endings and excess blank lines, and does not claim to rewrite or verify facts.

To connect an OpenAI-compatible **chat completions** endpoint, set in `.env.local`:

```dotenv
AI_API_KEY=your-provider-key
AI_BASE_URL=https://api.groq.com/openai/v1
AI_MODEL=openai/gpt-oss-20b
```

Choose a model supported by your provider. Restart the app after changing environment variables. Keys remain server-side. Once connected, clicking Improve sends the note text to the configured provider. Requests time out after 30 seconds; unavailable or malformed provider responses fall back to local formatting with a visible explanation. Review mathematical statements and code before publishing.

`lib/ai.ts` defines the provider contract. Add a provider adapter there if its API differs from chat completions. No real provider call is required for local use or the default tests.

## Project structure

```text
app/[[...path]]/page.tsx      Dashboard, subject, note and admin routes
app/api/notes/route.ts       Validated CRUD with admin authorization
app/api/session/route.ts     Login/logout and session status
app/api/improve/route.ts     Protected AI endpoint
components/workspace.tsx     Study workspace and editor flows
components/markdown.tsx      Safe Markdown/math/code rendering
lib/model.ts                Domain model and input validation
lib/repository.ts           Async cloud/local repository selector
lib/supabase-repository.ts  Supabase REST storage and shared login limiter
lib/sqlite-repository.ts    Local SQLite storage
supabase/setup.sql          Cloud schema, permissions and FOA seed
lib/auth.ts                 Signed, HttpOnly administrator sessions
lib/ai.ts                   AI provider and explicit fallback
tests/                      Domain and end-to-end smoke checks
```

## Supabase storage

Already implemented. Follow DEPLOY-VERCEL.md to create the database and configure credentials. The notes API uses an asynchronous repository contract; secrets remain in server routes. The optional scripts/import-local.mjs imports SQLite rows without overwriting existing cloud IDs.

## Security scope

This is a single-administrator first version. Mutations check a signed HttpOnly, SameSite cookie and request origin. Login uses a shared PostgreSQL attempt limit in cloud mode and a process-local limit in local mode, sessions persist for 30 days, and changing the password invalidates existing sessions. Logout clears the browser cookie; it is not centralized session revocation. For public multi-user use, add managed identity, per-user rate limiting, audit logs and recovery. Serve over HTTPS; session cookies are marked Secure on HTTPS requests. Reverse proxies must preserve the external request origin correctly.

## Verification

```sh
npm test
npm run typecheck
npm run build
```

With the app running, set `TEST_ADMIN_PASSWORD` to its admin password, then run:

```sh
node tests/smoke.mjs
```

The smoke test creates a temporary note and removes it in a `finally` block. It checks seed data, login, unauthenticated mutation rejection, draft privacy, AI separation from publishing, publish/edit, cross-origin rejection, validation and deletion. Use a disposable database when testing changes.

Optional browser tests (install Playwright Chromium first with `npx playwright install chromium`):

```sh
node tests/browser.mjs
```

Fonts use Google Fonts with local sans-serif fallbacks. All core note functionality works without fetching fonts. SQLite may emit an experimental API warning on supported Node releases.

