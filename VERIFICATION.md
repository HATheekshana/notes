# Verification — 3 October 2026

Tested with Node.js 24.14.0 and Next.js 16.3.6 on Windows.

| Check | Result |
| --- | --- |
| Production build | Passed |
| TypeScript check | Passed |
| Domain, Supabase adapter, PDF validation and PostgreSQL tests | 7 passed |
| API integration smoke test | Passed |
| Desktop browser at 1440px | Passed |
| Mobile browser at 390px | Passed, no horizontal overflow |
| Browser console / runtime errors, final run | None |
| Dependency audit after upgrade | 0 vulnerabilities reported |
| Vercel runtime without credentials | Safe 503 responses; no SQLite file created |

The 3 October update passed the production build and a focused browser test for publish-success Back/New note actions (including preserved subject and empty new editor), all five resource sections, PDF upload, refresh persistence, byte-for-byte download, subject isolation, unauthorized upload/delete rejection, invalid PDF and path rejection, mobile layout and confirmed deletion. Desktop/mobile resource screenshots were visually inspected. The Supabase Storage adapter was tested with mocked HTTP responses; live bucket access remains unverified without credentials. Run `supabase/resources.sql` before testing the deployed feature.

Browser checks used headless Microsoft Edge through Playwright. They exercised five subject cards, dark/light persistence, global search, lesson navigation, KaTeX rendering, syntax highlighting, table of contents, completion persistence, administrator sign-in, live Markdown preview, AI fallback comparison and acceptance, draft privacy, publishing and confirmed deletion. Screenshots were also visually reviewed.

The API checks exercised private drafts, mutation authorization, HttpOnly cookies, origin validation, note validation and separation of AI improvement from publishing. Temporary test notes were removed.

The AI workflow was tested with the local fallback. A paid/external provider was not called because no credentials were supplied. The optional WebMCP search tool is feature-detected; its registration was not validated in a WebMCP-enabled browser. This does not affect normal browser functionality.

This version is prepared for Vercel with Supabase storage. PostgreSQL schema, idempotent seeding, anonymous/authenticated-role denial and the durable login limit were executed in PGlite (embedded PostgreSQL). The REST adapter was tested with mocked responses for filtering, credential headers, pagination, create/edit/delete, missing records, provider errors and login allowance.

No live Supabase account or Groq credentials were supplied, so actual cloud connectivity and real AI output remain unverified. No public deployment was created. Admin passwords, generated databases, installed dependencies and build output are excluded from the ZIP. Follow DEPLOY-VERCEL.md and complete its live verification steps after configuring your accounts.
