# Publish RenxZero for free

Use **Vercel Hobby + Supabase Free + optional Groq Free**. You create accounts in your own name and keep control of your notes and keys. No paid AI subscription is required. No domain purchase is required; Vercel provides a `vercel.app` address.

## 1. Create your database

1. Open [Supabase](https://supabase.com/dashboard) and create a project on the Free plan.
2. Wait for the database to be ready.
3. Open **SQL Editor → New query**.
4. Open `supabase/setup.sql` from this project, copy its complete contents into the editor and select **Run**.
5. In the Table Editor, check that `notes` contains **Introduction to Algorithms**. Then run `supabase/resources.sql` in a new SQL query to create the PDF storage bucket.
6. Find your project URL in the **Connect** dialog. It looks like `https://your-project.supabase.co`.
7. Under **Settings → API Keys**, create/copy a backend **secret key** beginning with `sb_secret_`. This is different from the database password and the publishable key.

The script creates tables, locks out direct browser access, seeds FOA once and creates a shared login-attempt limiter. You can rerun it without overwriting your notes or restoring deleted lessons. Use a dedicated project; the script reserves the tables `notes`, `renxzero_metadata`, and `renxzero_login_limit`.

## 2. Put the website on GitHub

1. Extract `RenxZero-Vercel.zip`.
2. Create a GitHub repository, for example `renxzero-notes`. A private repository is fine.
3. Upload the contents of the extracted `renxzero` folder. `package.json`, `app`, `lib`, and `vercel.json` should be at the repository root.
4. Do not upload `.env.local`, `node_modules`, `.next`, `data`, or `test-results`. The ZIP already excludes these.

## 3. Import into Vercel

1. Create a personal [Vercel](https://vercel.com/new) account on the **Hobby** plan.
2. Import the GitHub repository.
3. Keep the detected **Next.js** framework preset and the default output directory. Select the folder containing `package.json` as Root Directory if you uploaded a containing folder.
4. Use **Node.js 24.x**. The project declares this version.
5. Add the following environment variables before deploying:

| Name | Value | Required? |
| --- | --- | --- |
| `ADMIN_PASSWORD` | A unique password at least 12 characters long | Yes |
| `SUPABASE_URL` | Your `https://…supabase.co` project URL | Yes |
| `SUPABASE_SECRET_KEY` | Your backend `sb_secret_…` key | Yes |
| `AI_API_KEY` | Your Groq API key | Only for real AI |
| `AI_BASE_URL` | `https://api.groq.com/openai/v1` | With Groq |
| `AI_MODEL` | `openai/gpt-oss-20b` | With Groq |

Set values for **Production**. For Preview deployments, use a separate Supabase test project or understand that previews connected to the same database can edit your live notes. Do not prefix secrets with `NEXT_PUBLIC_`. Do not set `DATABASE_PATH` on Vercel.

6. Click **Deploy**. The provided configuration runs `npm run build`.
7. Open the assigned `vercel.app` link. Go to **Manage notes** and sign in with your admin password.

If you change environment variables later, redeploy so the new values take effect.

## 4. Enable free AI (optional)

Create a [Groq API key](https://console.groq.com/keys), stay on the Free plan, and add the three AI variables above. Redeploy. Try a short note first. Free requests have token and request limits; large notes may exceed them. If the provider fails or reaches its limit, the app clearly switches to local formatting. No automatic paid-provider fallback is configured.

AI output is never published automatically. Review and accept it in the editor, then choose **Publish note** yourself. Without an AI key, the entire notes website still works.

## 5. Check your deployed website

1. Open the FOA lesson and confirm formulas and code render.
2. Sign in, create a note, then **Save draft**.
3. Open the site in a private/incognito window: the draft must not appear.
4. Publish it, then refresh the private window: it should now appear.
5. Edit it and refresh to confirm the change persisted.
6. Redeploy once and verify the note is still there.
7. Delete your test note through Manage notes.

## Already have notes on your computer?

Your old SQLite database is retained locally. To copy local notes to Supabase, first run `setup.sql`, put the Supabase values in `.env.local`, then run from the project folder:

```sh
node --env-file=.env.local scripts/import-local.mjs
```

Existing cloud IDs are skipped, so the import cannot overwrite a cloud note. In particular, the cloud FOA seed will be retained if its ID already exists. Copy any customized local FOA text into the cloud editor manually. Back up your local database before importing. Progress and theme stay in each browser.

## Free-plan boundaries

- **Vercel Hobby:** for personal, non-commercial projects, with usage caps. Your personal university notes fit that intended use. [Vercel plan details](https://vercel.com/docs/plans/hobby)
- **Supabase Free:** currently includes 500 MB database storage; projects pause after a week of inactivity. Resume a paused project from the Supabase dashboard. Automatic database backups are not included in this plan; export important notes periodically. [Supabase pricing](https://supabase.com/pricing)
- **Groq Free:** rate and token limits apply. Check your account's limits; free quotas and supported models can change. [Groq limits](https://console.groq.com/docs/rate-limits)

Stay on free plans and within their quotas to keep the hosting/API cost at $0. A free setup does not promise unlimited traffic or uninterrupted service.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| Notes unavailable / login unavailable | Supabase is active; URL/key are correct; complete `setup.sql` ran; redeploy after setting variables |
| No lessons on a new installation | Run `setup.sql`, not only `schema.sql` |
| Login says not configured | `ADMIN_PASSWORD` is set for this deployment and has 12+ characters |
| Too many attempts | Wait one minute; the limit is shared across the single-admin site |
| AI only formats whitespace | Key missing, quota exceeded, provider timeout, or invalid model; check Groq's account dashboard |
| Draft appears in your browser | You are signed in as admin; check a private window |

Never paste secret keys into chat, screenshots, or GitHub files. They belong only in `.env.local` locally and Vercel's environment settings online.

Official references: [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys), [Vercel environment variables](https://vercel.com/docs/environment-variables/managing-environment-variables).
