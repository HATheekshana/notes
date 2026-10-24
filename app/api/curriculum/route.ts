import { isAdmin, sameOrigin } from '@/lib/auth';
import { getCurriculum, saveCurriculum, subjectUsage } from '@/lib/curriculum';
import { InputError } from '@/lib/errors';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const noStore = { 'Cache-Control': 'no-store' };
function failure(e: unknown) {
  if (e instanceof InputError) return Response.json({ error: e.message }, { status: e.code === 'CONFLICT' ? 409 : e.code === 'SETUP' ? 503 : 400 });
  return Response.json({ error: 'Courses & subjects are unavailable. Check the database settings.' }, { status: 503 });
}

// GET            -> the structure everyone sees: { version, courses: [{ id, name, semesters: [{ id, name, subjects }] }] }
// GET ?usage=1   -> (administrator) how many notes and files each subject holds
export async function GET(req: Request) {
  try {
    if (new URL(req.url).searchParams.has('usage')) {
      if (!await isAdmin()) return Response.json({ error: 'Administrator login required.' }, { status: 401 });
      return Response.json(await subjectUsage(), { headers: noStore });
    }
    return Response.json(await getCurriculum(), { headers: noStore });
  } catch (e) { return failure(e); }
}

// PUT { version, courses } -> replaces the whole structure (the administrator edits it as one document)
export async function PUT(req: Request) {
  if (!sameOrigin(req) || !await isAdmin()) return Response.json({ error: 'Administrator login required.' }, { status: 401 });
  try {
    const raw = await req.text();
    if (raw.length > 100000) throw new InputError('Request too large.');
    let body: unknown;
    try { body = JSON.parse(raw); } catch { throw new InputError('Invalid request.'); }
    return Response.json(await saveCurriculum(body), { headers: noStore });
  } catch (e) { return failure(e); }
}
