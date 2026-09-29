import { isAdmin, sameOrigin } from '@/lib/auth';
import { repository } from '@/lib/repository';
import { validateNote } from '@/lib/model';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const unavailable = () => Response.json({ error: 'Notes are unavailable. Check the database settings and setup.sql in the deployment guide.' }, { status: 503 });
export async function GET() {
  try { return Response.json(await (await repository()).list(await isAdmin()), { headers: { 'Cache-Control': 'private, no-store' } }); }
  catch { return unavailable(); }
}
export async function POST(req: Request) {
  if (!sameOrigin(req) || !await isAdmin()) return Response.json({ error: 'Administrator login required.' }, { status: 401 });
  let input, note;
  try {
    const raw = await req.text();
    if (raw.length > 120000) throw Error('Note too large.');
    input = JSON.parse(raw); note = validateNote(input);
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
  const id = new URL(req.url).searchParams.get('id');
  if (!id || !/^[a-zA-Z0-9-]{1,100}$/.test(id)) return Response.json({ error: 'Invalid note ID.' }, { status: 400 });
  try {
    if (!await (await repository()).delete(id)) return Response.json({ error: 'Note not found.' }, { status: 404 });
    return Response.json({ ok: true });
  } catch { return unavailable(); }
}
