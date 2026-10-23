# Add the Storage section to your existing site

Every subject page now has a **Storage** card between the subject banner and the lessons. It opens `/subjects/<SUBJECT>/storage`, a separate page where everyone can browse folders and open or download files, and the signed-in administrator can create folders, upload files, rename and delete.

## Apply the update

1. Open **Supabase → SQL Editor → New query**, paste the full contents of `supabase/storage.sql`, and run it. **Success. No rows returned** is normal. It is safe to run more than once.
2. Copy the new and changed files into your repository, commit and push. Vercel redeploys automatically.
3. No new environment variables are needed. It reuses `SUPABASE_URL`, `SUPABASE_SECRET_KEY` and `ADMIN_PASSWORD`.
4. Sign in at **Manage notes**, open a subject, select **Storage**, then **New folder** / **Upload files**.

Running locally without Supabase also works: metadata goes in the SQLite file and files go in `data/storage/<subject>/`. Include that folder in local backups.

## Rules

- Allowed: PDF, PNG/JPG/GIF/WebP, DOC/DOCX, PPT/PPTX, XLS/XLSX, TXT, MD, CSV, ZIP. HTML and SVG are blocked on purpose because they can run scripts.
- Max **4 MB per file** (fits Vercel's request limit). Folders can nest 6 levels deep, with up to 1000 items per subject.
- File contents are checked against their extension (e.g. a `.pdf` must start with `%PDF-`). Contents are not scanned for malware.
- Uploading a name that already exists in the folder saves it as `name (2).pdf`. Renaming keeps the original file extension.
- Deleting a folder deletes everything inside it. Files live in a private `subject-storage` bucket and are only reachable through the website's API.
- The existing **Resources & PDFs** section is unchanged and still works.
