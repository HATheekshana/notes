import { isAdmin, sameOrigin } from '@/lib/auth';
import { createFolder, deleteItem, listItems, readFileItem, renameItem, uploadFile } from '@/lib/storage';
import { InputError, MAX_FILE_BYTES, extensionOf, fileTypes, isUuid, validStorageSubject } from '@/lib/storage-model';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const noStore = { 'Cache-Control': 'no-store' };
const denied = () => Response.json({ error: 'Administrator login required.' }, { status: 401 });
function failure(e: unknown) {
  if (e instanceof InputError) return Response.json({ error: e.message }, { status: e.code === 'ENOENT' ? 404 : 400 });
  return Response.json({ error: 'Storage unavailable. Check Supabase Storage and run supabase/storage.sql.' }, { status: 503 });
}
const subjectOf = (v: unknown) => { const s = String(v || ''); if (!validStorageSubject(s)) throw new InputError('Invalid subject.'); return s; };
const parentOf = (v: unknown) => { if (v === null || v === undefined || v === '') return null; if (!isUuid(v)) throw new InputError('Invalid folder.'); return v; };

// GET ?subject=FOA            -> every folder/file in the subject (the client builds the tree)
// GET ?subject=FOA&id=<uuid>  -> the file itself; add &view=1 to open PDFs/images in the browser
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  try {
    const subject = subjectOf(params.get('subject')), id = params.get('id');
    if (id === null) return Response.json(await listItems(subject), { headers: noStore });
    const { item, bytes, mime } = await readFileItem(subject, id);
    const inline = params.get('view') === '1' && !!fileTypes[extensionOf(item.name)]?.inline;
    const ascii = item.name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
    return new Response(new Blob([Buffer.from(bytes)], { type: mime }), { headers: {
      'Content-Type': mime,
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(item.name)}`,
      'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store',
    } });
  } catch (e) { return failure(e); }
}

// POST multipart (subject, parentId, file)           -> upload a file
// POST json {action:'folder', subject, parentId, name} -> create a folder
export async function POST(req: Request) {
  if (!sameOrigin(req) || !await isAdmin()) return denied();
  try {
    if ((req.headers.get('content-type') || '').startsWith('multipart/form-data')) {
      if (Number(req.headers.get('content-length')) > MAX_FILE_BYTES + 65536) throw new InputError('Files must be 4 MB or smaller.');
      const form = await req.formData(), file = form.get('file');
      if (!(file instanceof File)) throw new InputError('Choose a file to upload.');
      if (file.size > MAX_FILE_BYTES) throw new InputError('Files must be 4 MB or smaller.');
      return Response.json(await uploadFile(subjectOf(form.get('subject')), parentOf(form.get('parentId')), file.name, new Uint8Array(await file.arrayBuffer())), { status: 201 });
    }
    const raw = await req.text();
    if (raw.length > 4096) throw new InputError('Request too large.');
    let body: Record<string, unknown>;
    try { body = JSON.parse(raw); } catch { throw new InputError('Invalid request.'); }
    if (body.action !== 'folder') throw new InputError('Invalid request.');
    return Response.json(await createFolder(subjectOf(body.subject), parentOf(body.parentId), body.name), { status: 201 });
  } catch (e) { return failure(e); }
}

// PATCH json {subject, id, name} -> rename a folder or file
export async function PATCH(req: Request) {
  if (!sameOrigin(req) || !await isAdmin()) return denied();
  try {
    const raw = await req.text();
    if (raw.length > 4096) throw new InputError('Request too large.');
    let body: Record<string, unknown>;
    try { body = JSON.parse(raw); } catch { throw new InputError('Invalid request.'); }
    await renameItem(subjectOf(body.subject), String(body.id || ''), body.name);
    return Response.json({ ok: true });
  } catch (e) { return failure(e); }
}

// DELETE ?subject=FOA&id=<uuid> -> delete a file, or a folder with everything inside it
export async function DELETE(req: Request) {
  if (!sameOrigin(req) || !await isAdmin()) return denied();
  const params = new URL(req.url).searchParams;
  try { await deleteItem(subjectOf(params.get('subject')), params.get('id') || ''); return Response.json({ ok: true }); }
  catch (e) { return failure(e); }
}
