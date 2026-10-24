import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { InputError } from '../lib/errors.ts';
import { addCourse, addSemester, addSubject, defaultCurriculum, moveSubject, removeSemester, removeSubject, subjectIdsOf, updateSubject, type Curriculum, type SubjectDef } from '../lib/curriculum-model.ts';

const subj = (id: string, over: Partial<SubjectDef> = {}): SubjectDef => ({ id, name: 'Subject ' + id, description: '', icon: 'Code', color: '#7367eb', ...over });
const none = { notes: async () => ({}), files: async () => ({}), resources: async () => 0 };
const failsWith = (re: RegExp, code?: string) => (e: unknown) => e instanceof InputError && re.test(e.message) && (code === undefined || e.code === code);

delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SECRET_KEY; delete process.env.VERCEL;
process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), 'curr-')), 'test.sqlite');
const c = await import('../lib/curriculum.ts');
const storage = await import('../lib/storage.ts');

test('before anything is saved the built-in five subjects are used, and unknown subjects are rejected', async () => {
  const cur = await c.getCurriculum();
  assert.equal(cur.version, 0); assert.deepEqual(subjectIdsOf(cur), ['FOA', 'OS', 'IWT', 'DBMS', 'OOP']);
  assert.equal(await c.requireSubject('FOA'), 'FOA');
  for (const bad of ['ISDB', '', 'foa', '../x', undefined as unknown as string, 5 as unknown as string]) await assert.rejects(() => c.requireSubject(bad), failsWith(/Invalid subject/));
});

test('the administrator workflow: add a course, a semester and a subject, and use it straight away', async () => {
  let draft: Curriculum = defaultCurriculum;
  draft = addCourse(draft, 'IS', 'Information Systems');
  draft = addSemester(draft, 'IS', 'Year 2 · Semester 1', 'sem-is21');
  draft = addSubject(draft, 'sem-is21', subj('ISDB', { name: 'Database Design' }));
  const saved = await c.saveCurriculum(draft);
  assert.equal(saved.version, 1);
  const read = await c.getCurriculum();
  assert.equal(read.version, 1); assert.ok(subjectIdsOf(read).includes('ISDB') && subjectIdsOf(read).includes('FOA'));
  assert.equal(await c.requireSubject('ISDB'), 'ISDB', 'the new subject is valid immediately');
  const folder = await storage.createFolder('ISDB', null, 'Week 1');
  assert.equal(folder.subject, 'ISDB', 'Storage works for the new subject');
});

test('stale edits are refused instead of overwriting newer ones', async () => {
  const now = await c.getCurriculum();
  const mine = addCourse(now, 'SE', 'Software Engineering');
  await c.saveCurriculum(mine);                                                    // first admin tab saves
  await assert.rejects(() => c.saveCurriculum({ version: now.version, courses: addCourse(now, 'IT', 'Information Technology').courses }), failsWith(/changed somewhere else/, 'CONFLICT')); // second tab still has the old version
  assert.ok(!(await c.getCurriculum()).courses.some(x => x.id === 'IT'));
  assert.equal((await c.getCurriculum()).version, now.version + 1);
});

test('invalid curricula are rejected and nothing changes', async () => {
  const now = await c.getCurriculum();
  const bad = { version: now.version, courses: [{ id: 'cs', name: 'X', semesters: [{ id: 'sem-1', name: 'S', subjects: [subj('AB'), subj('AB', { name: 'Other' })] }] }] };
  await assert.rejects(() => c.saveCurriculum(bad), failsWith(/already used/));
  for (const junk of [null, 'x', {}, { version: 'a', courses: [] }, { version: -1, courses: [] }, { version: 1.5, courses: [] }, { courses: [] }]) await assert.rejects(() => c.saveCurriculum(junk), InputError);
  assert.equal((await c.getCurriculum()).version, now.version);
});

test('a subject that still has content cannot be removed, and the message says why', async () => {
  const now = await c.getCurriculum();
  const without = (id: string) => ({ version: now.version, courses: removeSubject(now, id).courses });
  await assert.rejects(() => c.saveCurriculum(without('FOA'), { ...none, notes: async () => ({ FOA: 3 }) }), failsWith(/“FOA” \(Fundamentals of Algorithms\) still has 3 notes/));
  await assert.rejects(() => c.saveCurriculum(without('FOA'), { ...none, notes: async () => ({ FOA: 1 }) }), failsWith(/1 note\b/));
  await assert.rejects(() => c.saveCurriculum(without('OS'), { ...none, files: async () => ({ OS: 4 }) }), failsWith(/4 files and folders/));
  await assert.rejects(() => c.saveCurriculum(without('IWT'), { ...none, resources: async () => 2 }), failsWith(/2 PDFs/));
  await assert.rejects(() => c.saveCurriculum(without('IWT'), { ...none, notes: async () => ({ IWT: 2 }), files: async () => ({ IWT: 1 }), resources: async () => 1 }), failsWith(/2 notes and 1 file or folder and 1 PDF/));
  await assert.rejects(() => c.saveCurriculum(without('DBMS'), { ...none, resources: async () => { throw Error('storage down'); } }), failsWith(/Could not check the PDFs/), 'unknown is treated as not safe');
  assert.ok(subjectIdsOf(await c.getCurriculum()).includes('FOA'), 'nothing was removed');
});

test('real storage content also protects a subject (uses the actual database, not a mock)', async () => {
  const now = await c.getCurriculum();
  await storage.createFolder('IWT', null, 'Slides');
  await assert.rejects(() => c.saveCurriculum({ version: now.version, courses: removeSubject(now, 'IWT').courses }, { ...none, files: storage.countItems }), failsWith(/“IWT” .* still has 1 file or folder/));
  assert.deepEqual((await c.subjectUsage({ ...none, files: storage.countItems, notes: async () => ({ FOA: 2 }) })).IWT, { notes: 0, files: 1 });
  assert.deepEqual((await c.subjectUsage({ ...none, files: storage.countItems, notes: async () => ({ FOA: 2 }) })).FOA, { notes: 2, files: 0 });
});

test('removing a whole semester or course is blocked if anything inside has content, and lists several', async () => {
  const now = await c.getCurriculum();
  const noSemester = { version: now.version, courses: removeSemester(now, 'y1s2').courses };
  await assert.rejects(() => c.saveCurriculum(noSemester, { ...none, notes: async () => ({ FOA: 1, OS: 1, IWT: 1, DBMS: 1 }) }), failsWith(/“FOA”.*; “OS”.*; “IWT”.*; and 1 more/));
});

test('renaming, restyling and reordering never touch content, even when a subject has notes', async () => {
  const now = await c.getCurriculum(), busy = { ...none, notes: async () => ({ FOA: 9, OS: 9 }), files: async () => ({ FOA: 9 }), resources: async () => 5 };
  let next = updateSubject(now, 'FOA', { name: 'Algorithms & Complexity', color: '#112233', icon: 'Brain' });
  next = moveSubject(next, 'y1s2', 'FOA', 1);
  const saved = await c.saveCurriculum({ version: now.version, courses: next.courses }, busy);
  assert.equal(saved.version, now.version + 1);
  assert.deepEqual(subjectIdsOf(await c.getCurriculum()).slice(0, 2), ['OS', 'FOA']);
});

test('an empty subject can be deleted, and then its code stops being valid', async () => {
  const now = await c.getCurriculum();
  await c.saveCurriculum({ version: now.version, courses: removeSubject(now, 'OOP').courses }, none);
  await assert.rejects(() => c.requireSubject('OOP'), failsWith(/Invalid subject/));
});

// ---------------------------------------------------------------------------------------------------------
test('cloud mode: reads, creates, updates with a version check, and tells "not set up" apart from an outage', async () => {
  const originalFetch = globalThis.fetch, env = { ...process.env };
  process.env.SUPABASE_URL = 'https://example.supabase.co'; process.env.SUPABASE_SECRET_KEY = 'sb_secret_test';
  let row: { id: number; data: unknown; version: number } | null = null; let mode: 'ok' | 'missing' | 'outage' = 'ok';
  const calls: { url: string; init: RequestInit }[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    if (!String(url).includes('/rest/v1/curriculum')) return Response.json({});
    if (mode === 'missing') return Response.json({ code: 'PGRST205', message: 'Could not find the table' }, { status: 404 });
    if (mode === 'outage') return new Response('secret internal details', { status: 500 });
    const method = init.method || 'GET', u = new URL(String(url));
    if (method === 'GET') return Response.json(row ? [row] : []);
    if (method === 'POST') { if (row) return Response.json([]); const b = JSON.parse(init.body as string); row = b; return Response.json([b], { status: 201 }); }
    if (method === 'PATCH') { const want = Number(u.searchParams.get('version')!.replace('eq.', '')); if (!row || row.version !== want) return Response.json([]); const b = JSON.parse(init.body as string); row = { ...row, data: b.data, version: b.version }; return Response.json([row]); }
    return new Response(null, { status: 204 });
  }) as typeof fetch;
  try {
    const specifier = '../lib/curriculum.ts?cloud';
    const cc = (await import(specifier)) as typeof import('../lib/curriculum.ts');
    assert.equal((await cc.getCurriculum()).version, 0, 'empty table → built-in default');
    const first = await cc.saveCurriculum({ version: 0, courses: addCourse(defaultCurriculum, 'IS', 'Information Systems').courses }, none);
    assert.equal(first.version, 1);
    const post = calls.find(x => x.init.method === 'POST')!;
    assert.match((post.init.headers as Record<string, string>).Prefer, /return=representation/); assert.equal((post.init.headers as Record<string, string>).apikey, 'sb_secret_test');
    assert.deepEqual(JSON.parse(post.init.body as string).version, 1);
    assert.deepEqual(subjectIdsOf(await cc.getCurriculum()).length, 5);
    const second = await cc.saveCurriculum({ version: 1, courses: addCourse(await cc.getCurriculum(), 'SE', 'Software Engineering').courses }, none);
    assert.equal(second.version, 2); assert.equal(row!.version, 2);
    assert.ok(calls.some(x => x.init.method === 'PATCH' && x.url.includes('version=eq.1')), 'update is conditional on the version it read');
    await assert.rejects(() => cc.saveCurriculum({ version: 1, courses: [] }, none), failsWith(/changed somewhere else/, 'CONFLICT'));
    row!.version = 9;                                                                // somebody else saved between our read and write
    const racing = addCourse({ version: 2, courses: (await cc.getCurriculum()).courses }, 'IT', 'Information Technology');
    await assert.rejects(() => cc.saveCurriculum({ version: 9, courses: racing.courses }, none).then(() => { row!.version = 10; return cc.saveCurriculum({ version: 9, courses: racing.courses }, none); }), failsWith(/changed somewhere else/, 'CONFLICT'));
    mode = 'missing';
    assert.equal((await cc.getCurriculum()).version, 0, 'table not created yet → the app keeps working with the built-in subjects');
    await assert.rejects(() => cc.saveCurriculum({ version: 0, courses: [] }, none), failsWith(/Run supabase\/curriculum\.sql/, 'SETUP'));
    mode = 'outage';
    await assert.rejects(() => cc.getCurriculum(), (e: Error) => !(e instanceof InputError) && !/secret internal/.test(e.message), 'a real outage is an error, never silently replaced by defaults');
    await assert.rejects(() => cc.requireSubject('FOA'), (e: Error) => !(e instanceof InputError));
  } finally { globalThis.fetch = originalFetch; process.env = env; }
});
