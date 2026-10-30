import { isAdmin, sameOrigin } from '@/lib/auth';
import { repository } from '@/lib/repository';
import { noteTitleFromFileName, validateNote, type Note } from '@/lib/model';
import { subjectIds } from '@/lib/curriculum';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const unavailable = () => Response.json({ error: 'Notes are unavailable. Check the database settings and setup.sql in the deployment guide.' }, { status: 503 });
export async function GET() {
  try { return Response.json(await (await repository()).list(await isAdmin()), { headers: { 'Cache-Control': 'private, no-store' } }); }
  catch { return unavailable(); }
}
export async function POST(req: Request) {
  if (!sameOrigin(req) || !await isAdmin()) return Response.json({ error: 'Administrator login required.' }, { status: 401 });
  let input, note, valid: string[];
  try { valid = await subjectIds(); } catch { return unavailable(); }
  if ((req.headers.get('content-type') || '').startsWith('multipart/form-data')) {
    try {
      const form = await req.formData();
      const subject = String(form.get('subject') || '');
      if (!valid.includes(subject)) throw Error('Choose a valid subject.');
      const published = form.get('published') === 'true';
      const selected = form.getAll('files').filter((entry): entry is File => entry instanceof File);
      if (!selected.length) throw Error('Choose at least one Markdown or text file.');
      if (selected.length > 50) throw Error('Upload no more than 50 files at once.');
      const saved: Note[] = [];
      const failed: { name: string; error: string }[] = [];
      const db = await repository();
      for (const file of selected) {
        try {
          if (!/^\.(md|markdown|txt)$/i.test(file.name.match(/\.[^.]*$/)?.[0] || '') || file.size === 0 || file.size > 100000) throw Error('Use a non-empty Markdown or text file up to 100 KB.');
          const note = validateNote({ subject, title: noteTitleFromFileName(file.name), content: await file.text(), tags: [], published }, valid);
          saved.push(await db.save(note));
        } catch (e) { failed.push({ name: file.name, error: e instanceof Error ? e.message : 'Could not import this file.' }); }
      }
      return Response.json({ saved: saved.length, failed }, { status: failed.length ? 207 : 201 });
    } catch (e) { return Response.json({ error: e instanceof Error ? e.message : 'Bulk upload failed.' }, { status: 400 }); }
  }
  try {
    const raw = await req.text();
    if (raw.length > 120000) throw Error('Note too large.');
    input = JSON.parse(raw); note = validateNote(input, valid);
    if (input.id !== undefined && (typeof input.id !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(input.id))) throw Error('Invalid note ID.');
  } catch (e) { return Response.json({ error: e instanceof Error ? e.message : 'Invalid note' }, { status: 400 }); }
  try {
    const db = await repository();
    if (input.id && !(await db.list(true)).some(n => n.id === input.id)) return Response.json({ error: 'Note no longer exists.' }, { status: 404 });
    return Response.json(await db.save(note, input.id));
  } catch { return unavailable(); }
}
export async function DELETE(req: Request) {
  if (!sameOrigin(req) || !await isAdmin()) return Response.json({ error: 'Administrator login required.' }, { status: 401 });
  const params = new URL(req.url).searchParams;
  const ids = params.get('ids')?.split(',') || (params.get('id') ? [params.get('id')!] : []);
  if (!ids.length || ids.some(id => !/^[a-zA-Z0-9-]{1,100}$/.test(id))) return Response.json({ error: 'Invalid note ID.' }, { status: 400 });
  try {
    const db = await repository();
    const deleted = await Promise.all(ids.map(id => db.delete(id)));
    if (!deleted.some(Boolean)) return Response.json({ error: 'Note not found.' }, { status: 404 });
    return Response.json({ ok: true, deleted: deleted.filter(Boolean).length });
  } catch { return unavailable(); }
}
