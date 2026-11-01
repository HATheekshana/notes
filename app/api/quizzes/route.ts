import { isAdmin, sameOrigin } from '@/lib/auth';
import { requireSubject } from '@/lib/curriculum';
import { InputError, validStorageSubject } from '@/lib/storage-model';
import { MAX_QUIZ_BYTES, publicQuiz, parseQuizFile, scoreQuiz } from '@/lib/quizzes-model';
import { addQuiz, getQuiz, listQuizzes, removeQuiz } from '@/lib/quizzes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function subjectOf(value: unknown) {
  const subject = String(value || '');
  if (!validStorageSubject(subject)) throw new InputError('Invalid subject.');
  await requireSubject(subject);
  return subject;
}

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const subject = params.get('subject');
  const id = params.get('id');
  try {
    if (id) {
      if (!subject) return Response.json({ error: 'Choose a subject.' }, { status: 400 });
      const quiz = await getQuiz(id, await subjectOf(subject));
      if (!quiz) return Response.json({ error: 'Quiz not found.' }, { status: 404 });
      return Response.json(publicQuiz(quiz), { headers: { 'Cache-Control': 'no-store' } });
    }
    if (!subject) return Response.json({ error: 'Choose a subject.' }, { status: 400 });
    return Response.json(await listQuizzes(await subjectOf(subject)), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Quizzes unavailable.' }, { status: 400 });
  }
}

export async function POST(req: Request) {
  const contentType = req.headers.get('content-type') || '';
  if (contentType.includes('multipart/form-data')) {
    if (!sameOrigin(req) || !await isAdmin()) return Response.json({ error: 'Administrator login required.' }, { status: 401 });
    try {
      const form = await req.formData();
      const subject = await subjectOf(form.get('subject'));
      const file = form.get('file');
      const customTitle = String(form.get('title') || '').trim();
      if (!(file instanceof File)) return Response.json({ error: 'Choose a TXT quiz file.' }, { status: 400 });
      if (!file.name.toLowerCase().endsWith('.txt')) return Response.json({ error: 'Choose a TXT quiz file.' }, { status: 400 });
      if (file.size <= 0 || file.size > MAX_QUIZ_BYTES) return Response.json({ error: 'TXT quizzes must be smaller than 4 MB.' }, { status: 400 });
      const quiz = parseQuizFile(await file.text(), subject);
      quiz.title = customTitle || quiz.title;
      if (!quiz.title || quiz.title.length > 160) return Response.json({ error: 'Enter a quiz title under 160 characters.' }, { status: 400 });
      return Response.json(await addQuiz(quiz), { status: 201 });
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : 'Could not import the quiz.' }, { status: 400 });
    }
  }

  try {
    const body = await req.json() as { action?: string; subject?: string; id?: string; answers?: Record<string, string | string[]> };
    if (body.action !== 'submit') return Response.json({ error: 'Invalid request.' }, { status: 400 });
    const subject = await subjectOf(body.subject);
    const quiz = await getQuiz(String(body.id || ''), subject);
    if (!quiz) return Response.json({ error: 'Quiz not found.' }, { status: 404 });
    if (!body.answers || typeof body.answers !== 'object' || Array.isArray(body.answers)) return Response.json({ error: 'Answers are required.' }, { status: 400 });
    return Response.json(scoreQuiz(quiz, body.answers));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Could not submit the quiz.' }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  if (!sameOrigin(req) || !await isAdmin()) return Response.json({ error: 'Administrator login required.' }, { status: 401 });
  const params = new URL(req.url).searchParams;
  try {
    const subject = await subjectOf(params.get('subject'));
    await removeQuiz(params.get('id') || '', subject);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Could not delete the quiz.' }, { status: 400 });
  }
}
