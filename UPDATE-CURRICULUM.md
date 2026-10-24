# Courses, semesters and subjects (managed in the app)

Subjects are no longer fixed in the code. The administrator adds courses (for example **CS** and **IS**), semesters and subjects from **Manage → Courses & subjects**, and readers pick their semester in the sidebar.

## Apply the update
1. Open **Supabase → SQL Editor → New query**, paste the full contents of `supabase/curriculum.sql`, and run it. "Success. No rows returned" is normal. It is safe to run more than once and never overwrites a curriculum you have saved.
2. Deploy the code (commit and push).
3. Sign in at **Manage notes**, then open **Courses & subjects**.

Your five current subjects (FOA, OS, IWT, DBMS, OOP) become **Computer Science → Year 1 · Semester 2**. All existing notes, PDFs and files stay linked to them. Until you run the SQL the app keeps working with those five subjects, but new subjects cannot be saved.

## Using it
- **Add course:** a name and a short code (for example `IS`). The code is suggested from the name.
- **Add semester:** name it yourself, for example `Year 2 · Semester 1`. New semesters get the next sensible name.
- **Add subject:** a code, a name, an optional one-line description, an icon and a colour.
- **Subject codes must be unique across all courses.** If CS already has `DBMS`, call the IS one `IS-DBMS`. Each subject has its own notes, files and PDFs.
- Use the arrows to reorder. Everything is edited as a draft and nothing changes for readers until you press **Save changes**. **Discard** throws the draft away.
- A subject's **code cannot be changed** once created, because notes and files are linked to it. You can change its name, description, icon and colour at any time.

## Safety rules
- **A subject that still has notes, files/folders or PDFs cannot be deleted.** The editor shows how much each subject holds and disables Delete with the reason. Move the notes to another subject (edit the note) or delete the content first. Deleting a semester or course follows the same rule for everything inside it.
- If you edit in two browser tabs, the second save is refused with "This was changed somewhere else" and a **Load latest** button, so one edit cannot silently overwrite another.
- Limits: 10 courses, 12 semesters per course, 20 subjects per semester, 150 subjects in total.

## For readers and the installed app
- With more than one semester, a picker at the top of the subject list switches between them (grouped by course). Opening a subject jumps to its own semester. The choice is remembered on that device.
- The overview and "latest notes" show the chosen semester.
- The installed/offline app takes the structure live when online and keeps the last copy for offline use. New subjects appear without needing "Update now"; notes inside them still follow the "ask before updating" rule.

## Developer notes
- The structure is one record in the `curriculum` table (Supabase) or SQLite (local): Course → Semester → Subject. `lib/curriculum-model.ts` holds the rules, `lib/curriculum.ts` the storage and safety checks, `/api/curriculum` the API.
- Notes, Storage and PDF routes check that a subject exists in the curriculum. The database only checks the code's format (`^[A-Z0-9][A-Z0-9_-]{1,11}$`).
- A test checks that the seed in `supabase/curriculum.sql` matches `DEFAULT_COURSES` in code.
