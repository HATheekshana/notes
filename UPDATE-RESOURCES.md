# Update your existing Vercel website

This update adds:

- A publishing success notification with **Back to notes** and **New note** buttons. New note keeps the subject selected and opens a blank editor.
- **Resources & PDFs** on all five subject pages.
- Admin-only PDF upload and confirmed deletion; downloads available to all readers.
- Persistent Supabase Storage online and local disk storage when developing without Supabase.

## Apply the update

1. Open **Supabase → SQL Editor → New query**.
2. Copy and run the complete contents of `supabase/resources.sql` from this ZIP. **Success. No rows returned** is normal.
3. Replace the website source in your existing GitHub repository with this updated project's files. Preserve your local `.env.local` if you have one. Do not upload `node_modules`, `.next`, `data`, or `.env.local`.
4. Commit the changes. Vercel will redeploy if your GitHub integration is enabled; otherwise redeploy the updated source through Vercel.
5. Keep your existing Vercel environment variables. No new keys or variables are required.
6. Sign in at **Manage notes**, then open a subject using the sidebar. Scroll to **Resources & PDFs** and select **Upload PDF**.

Your existing notes, domain connection and admin password are unchanged. Do not delete your Supabase project or rerun a reset script.

## Check it

Publish a test note and check both notification actions. Upload a small PDF to FOA, refresh, and download it from a private browser window. Check that the PDF does not appear under OS. Delete the test PDF while signed in if no longer needed.

PDFs are limited to **50 MB each**. Cloud uploads and downloads use short-lived, private Supabase Storage URLs, so large files do not pass through Vercel's request/response size limits. PDFs over 4 MB can be downloaded online but are not offered for offline saving. After changing to this version, rerun `supabase/resources.sql` to raise the bucket limit. Supabase plan quotas and project settings still apply. Other file formats are not supported in this version. All uploaded resources are immediately visible to readers; there is no resource draft state. Duplicate filenames are allowed and stored separately. Files live in a private `subject-resources` bucket; the website controls access through its server API. No public bucket or anonymous upload policy is needed.

The app checks the file extension, size, and PDF header. It does not scan PDF contents for malware. Local PDFs are stored alongside the local database in `resources/<subject>/`; include this folder in local backups. Existing local PDF files are not moved by the notes-only import script.

If the resources panel reports a setup error, check that `resources.sql` ran in the same Supabase project used by your Vercel environment variables.
