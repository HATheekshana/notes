import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { APP, FakeCacheStorage } from './fake-caches.ts';
import { diffNotes, describeDiff, diffSignature, hasChanges, parseSnapshot, publishedOnly, type SyncNote } from '../lib/sync-model.ts';
import { addCourse, defaultCurriculum, type Curriculum } from '../lib/curriculum-model.ts';
import { CACHE, applyUpdate, checkPending, loadCurriculum, loadWorkspaceData, readCachedCurriculum, writeCachedCurriculum, readSnapshot, removeSavedFile, saveFile, savedFileKeys, warmPages, writeSnapshot } from '../lib/offline.ts';

const g = globalThis as any;
const note = (id: string, over: Partial<SyncNote> = {}): SyncNote => ({ id, subject: 'FOA', title: 'Note ' + id, content: 'body', tags: [], published: true, updatedAt: '2026-10-01T00:00:00Z', ...over });
const withIS = (version: number): Curriculum => addCourse({ ...defaultCurriculum, version }, 'IS', 'Information Systems');
const server = { admin: false, notes: [] as SyncNote[], offline: false, notesStatus: 200, calls: [] as string[], curriculum: withIS(3) as Curriculum, curriculumStatus: 200 };
let standalone = false;

beforeEach(() => {
  Object.assign(server, { admin: false, notes: [], offline: false, notesStatus: 200, calls: [], curriculum: withIS(3), curriculumStatus: 200 });
  standalone = false;
  g.caches = new FakeCacheStorage();
  g.location = { origin: APP, search: '' };
  g.window = { matchMedia: () => ({ matches: standalone }) };
  g.fetch = async (input: any) => {
    const u = new URL(typeof input === 'string' ? input : input.url, APP);
    server.calls.push(u.pathname + u.search);
    if (server.offline) throw new TypeError('Failed to fetch');
    if (u.pathname === '/api/session') return Response.json({ admin: server.admin, configured: true });
    if (u.pathname === '/api/curriculum') return server.curriculumStatus === 200 ? Response.json(server.curriculum) : Response.json({ error: 'Courses & subjects are unavailable.' }, { status: server.curriculumStatus });
    if (u.pathname === '/api/notes') return server.notesStatus === 200 ? Response.json(server.admin ? server.notes : server.notes.filter(n => n.published)) : Response.json({ error: 'Database unavailable.' }, { status: server.notesStatus });
    if (u.pathname === '/api/storage') return u.searchParams.get('id') === 'missing' ? Response.json({ error: 'File not found.' }, { status: 404 }) : new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 1, 2]), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="a.pdf"' } });
    if (u.pathname.startsWith('/notes/') || u.pathname.startsWith('/subjects/') || u.pathname === '/') return new Response('<html>shell</html>', { headers: { 'Content-Type': 'text/html' } });
    return new Response('nope', { status: 404 });
  };
});

test('diff detects new, changed and removed notes, and ignores identical ones', () => {
  const local = [note('a'), note('b'), note('c')];
  const remote = [note('a'), note('b', { updatedAt: '2026-10-02T00:00:00Z' }), note('d')];
  const d = diffNotes(local, remote);
  assert.deepEqual([d.added.map(n => n.id), d.changed.map(n => n.id), d.removed.map(n => n.id)], [['d'], ['b'], ['c']]);
  assert.equal(describeDiff(d), '1 new note, 1 updated note, 1 removed note');
  assert.equal(hasChanges(diffNotes(local, [...local])), false);
  assert.equal(describeDiff({ added: [note('x'), note('y')], changed: [], removed: [] }), '2 new notes');
  assert.equal(diffSignature(d), diffSignature(diffNotes(local, remote)), 'signature is stable');
  assert.notEqual(diffSignature(d), diffSignature(diffNotes(local, [note('a'), note('b', { updatedAt: 'later' }), note('d')])));
});

test('snapshots never hold drafts or malformed entries', () => {
  assert.deepEqual(publishedOnly([note('a'), note('b', { published: false })]).map(n => n.id), ['a']);
  const parsed = parseSnapshot({ savedAt: 'x', notes: [note('a'), note('draft', { published: false }), { id: 1 }, null] });
  assert.deepEqual(parsed!.notes.map(n => n.id), ['a']);
  assert.equal(parseSnapshot({ notes: [] }), null);
  assert.equal(parseSnapshot('nope'), null);
});

test('browser tab: always live, and keeps a published-only offline copy', async () => {
  server.admin = true; server.notes = [note('a'), note('draft', { published: false })];
  const data = await loadWorkspaceData();
  assert.deepEqual(data.notes.map(n => n.id), ['a', 'draft'], 'admin sees drafts live');
  assert.equal(data.admin, true); assert.equal(data.pending, null);
  assert.deepEqual((await readSnapshot())!.notes.map(n => n.id), ['a'], 'drafts are never saved to the device');
});

test('installed app, first run: saves notes, nothing to ask about', async () => {
  standalone = true; server.notes = [note('a'), note('b')];
  const data = await loadWorkspaceData();
  assert.equal(data.notes.length, 2); assert.equal(data.pending, null); assert.ok(data.savedAt);
  assert.equal((await readSnapshot())!.notes.length, 2);
});

test('installed app: newer notes are NOT applied silently, the reader is asked first', async () => {
  standalone = true;
  await writeSnapshot([note('a'), note('b'), note('c')]);
  server.notes = [note('a'), note('b', { updatedAt: '2026-10-05T00:00:00Z', title: 'Note b (edited)' }), note('d')];
  const data = await loadWorkspaceData();
  assert.deepEqual(data.notes.map(n => n.id), ['a', 'b', 'c'], 'still shows the saved notes');
  assert.equal(data.notes.find(n => n.id === 'b')!.title, 'Note b', 'edit not applied yet');
  assert.deepEqual([data.pending!.diff.added.length, data.pending!.diff.changed.length, data.pending!.diff.removed.length], [1, 1, 1]);
  assert.deepEqual((await readSnapshot())!.notes.map(n => n.id), ['a', 'b', 'c'], 'saved copy untouched until the user agrees');

  // user taps "Update now"
  server.calls.length = 0;
  await applyUpdate(data.pending!);
  await new Promise(r => setTimeout(r, 30));
  assert.deepEqual((await readSnapshot())!.notes.map(n => n.id).sort(), ['a', 'b', 'd']);
  assert.ok(server.calls.includes('/notes/d') && server.calls.includes('/notes/b'), 'pages of new and changed notes are saved for offline navigation');
  const again = await loadWorkspaceData();
  assert.equal(again.pending, null); assert.equal(again.notes.length, 3);
});

test('installed app: nothing changed means no prompt', async () => {
  standalone = true; server.notes = [note('a')];
  await writeSnapshot(server.notes);
  assert.equal((await loadWorkspaceData()).pending, null);
  assert.equal(await checkPending(), null);
});

test('offline: saved notes are shown and flagged; with nothing saved the message is clear', async () => {
  standalone = true; server.notes = [note('a')];
  await writeSnapshot(server.notes);
  server.offline = true;
  const data = await loadWorkspaceData();
  assert.equal(data.offline, true); assert.equal(data.notes.length, 1); assert.equal(data.admin, false);
  assert.equal(await checkPending(), 'offline');
  g.caches = new FakeCacheStorage();
  await assert.rejects(() => loadWorkspaceData(), /offline and no notes are saved/);
});

test('a server error is not mistaken for being offline', async () => {
  server.notesStatus = 503;
  await assert.rejects(() => loadWorkspaceData(), /Database unavailable/);
  standalone = true;
  await writeSnapshot([note('a')]);
  const data = await loadWorkspaceData();
  assert.equal(data.offline, false); assert.equal(data.pending, null); assert.equal(data.notes.length, 1, 'keeps showing saved notes');
  assert.equal(await checkPending(), null);
});

test('administrator in the installed app always gets live data including drafts', async () => {
  standalone = true; server.admin = true; server.notes = [note('a'), note('draft', { published: false })];
  await writeSnapshot([note('a')]);
  const data = await loadWorkspaceData();
  assert.equal(data.notes.length, 2); assert.equal(data.pending, null);
});

test('files are saved only on request, with their headers, and can be removed', async () => {
  const path = '/api/storage?subject=FOA&id=abc&view=1';
  assert.equal((await savedFileKeys()).size, 0);
  const size = await saveFile(path);
  assert.equal(size, 7);
  assert.ok((await savedFileKeys()).has(APP + path), 'keyed by the exact URL the app opens');
  const hit = await (await g.caches.open(CACHE.files)).match(path);
  assert.equal(hit.headers.get('Content-Type'), 'application/pdf');
  assert.match(hit.headers.get('Content-Disposition'), /a\.pdf/);
  assert.deepEqual(new Uint8Array(await hit.arrayBuffer()).slice(0, 5), new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]));
  await removeSavedFile(path);
  assert.equal((await savedFileKeys()).size, 0);
});

test('saving a file fails with a clear message offline or when the server refuses', async () => {
  await assert.rejects(() => saveFile('/api/storage?subject=FOA&id=missing'), /File not found/);
  assert.equal((await savedFileKeys()).size, 0, 'nothing half-saved');
  server.offline = true;
  await assert.rejects(() => saveFile('/api/storage?subject=FOA&id=abc'), /offline/);
});

test('warming pages skips cached ones, de-duplicates and survives failures', async () => {
  const pages = await g.caches.open(CACHE.pages);
  await pages.put('/', new Response('cached'));
  await warmPages(['/', '/subjects/FOA', '/subjects/FOA', '/subjects/NOPE-404', '/notes/x']);
  assert.equal(server.calls.filter(c => c === '/').length, 0, 'already cached: not downloaded again');
  assert.equal(server.calls.filter(c => c === '/subjects/FOA').length, 1, 'duplicates collapsed');
  assert.ok(await pages.match('/subjects/FOA') && await pages.match('/notes/x'));
  server.offline = true;
  await warmPages(['/subjects/OS']); // must not throw
});

test('courses and subjects: taken live, saved for offline, and used when there is no network', async () => {
  server.notes = [note('a')];
  const online = await loadWorkspaceData();
  assert.deepEqual(online.curriculum.courses.map(c => c.id), ['CS', 'IS'], 'new course from the server is shown');
  assert.equal((await readCachedCurriculum())!.version, 3, 'saved on the device');
  standalone = true; await writeSnapshot(server.notes); server.offline = true;
  const offline = await loadWorkspaceData();
  assert.equal(offline.offline, true);
  assert.deepEqual(offline.curriculum.courses.map(c => c.id), ['CS', 'IS'], 'offline still shows the courses you saw last');
});

test('the structure is applied live in the installed app too (only notes are asked about)', async () => {
  standalone = true; server.notes = [note('a')];
  await writeSnapshot(server.notes); await writeCachedCurriculum({ ...defaultCurriculum, version: 1 });
  server.curriculum = withIS(2);
  const data = await loadWorkspaceData();
  assert.equal(data.curriculum.version, 2); assert.equal(data.pending, null, 'a new course alone does not trigger the notes prompt');
});

test('a server problem never breaks the app: saved structure, else the built-in subjects', async () => {
  server.curriculumStatus = 503; server.notes = [note('a')];
  assert.equal((await loadWorkspaceData()).curriculum.version, 0, 'nothing saved yet → built-in five subjects');
  server.curriculumStatus = 200; await loadCurriculum(); server.curriculumStatus = 503;
  assert.equal((await loadCurriculum()).version, 3, 'now the saved copy is used');
  assert.equal((await loadWorkspaceData()).notes.length, 1, 'notes still load');
});

test('a saved structure is never replaced by the built-in default (version 0)', async () => {
  await writeCachedCurriculum(withIS(5));
  server.curriculum = { ...defaultCurriculum, version: 0 };            // e.g. the server could not read its table
  const used = await loadCurriculum();
  assert.equal(used.version, 5); assert.equal((await readCachedCurriculum())!.version, 5, 'cache untouched');
  g.caches = new FakeCacheStorage();                                   // but on a brand-new device the default is fine
  assert.equal((await loadCurriculum()).version, 0);
});

test('offline with nothing saved yet falls back to the built-in subjects', async () => {
  standalone = true; await writeSnapshot([note('a')]); server.offline = true;
  assert.deepEqual((await loadWorkspaceData()).curriculum.courses.map(c => c.id), ['CS']);
});
