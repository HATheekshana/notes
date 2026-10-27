import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { InputError, MAX_FILE_BYTES, MAX_PDF_BYTES, cleanFileName, precheckFile, descendants, trail, uniqueName, validFileRename, validFolderName, validateFile, type StorageItem } from '../lib/storage-model.ts';

const pdf = new TextEncoder().encode('%PDF-1.4\n%%EOF');
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
const item = (id: string, parentId: string | null, kind: 'folder' | 'file', name = id): StorageItem => ({ id, subject: 'FOA', parentId, kind, name, size: 0, createdAt: '2026-01-01' });

test('folder names are trimmed and reject path tricks, repeatedly (no stateful regex)', () => {
  assert.equal(validFolderName('  Week   1  '), 'Week 1');
  for (let i = 0; i < 4; i++) assert.throws(() => validFolderName('a/b'), InputError); // back to back: a /g regex would pass every 2nd call
  assert.throws(() => validFolderName('..'), InputError);
  assert.throws(() => validFolderName('x'.repeat(81)), InputError);
  assert.throws(() => validFolderName('   '), InputError);
  assert.throws(() => validFolderName('bad\u0000name'), InputError);
});

test('file validation checks extension, signature, size and text content', () => {
  assert.deepEqual(validateFile('Lecture 1.PDF', pdf), { name: 'Lecture 1.pdf', mime: 'application/pdf' });
  assert.equal(validateFile('pic.png', png).mime, 'image/png');
  assert.throws(() => validateFile('evil.html', pdf), /not supported/);
  assert.throws(() => validateFile('evil.svg', pdf), /not supported/);
  assert.throws(() => validateFile('fake.pdf', new TextEncoder().encode('<html>')), /does not match/);
  assert.throws(() => validateFile('big.pdf', new Uint8Array(MAX_PDF_BYTES + 1)), /50 MB/);
  const largePdf = new Uint8Array(MAX_FILE_BYTES + 1); largePdf.set(new TextEncoder().encode('%PDF-'));
  assert.equal(validateFile('large.pdf', largePdf).mime, 'application/pdf');
  assert.throws(() => validateFile('big.txt', new Uint8Array(MAX_FILE_BYTES + 1)), /4 MB/);
  assert.throws(() => validateFile('empty.pdf', new Uint8Array(0)), /empty/);
  assert.throws(() => validateFile('bin.txt', new Uint8Array([65, 0, 66])), /text/);
  assert.equal(validateFile('notes.txt', new TextEncoder().encode('hello')).mime, 'text/plain');
});

test('file names are cleaned and renames keep the original extension', () => {
  assert.equal(cleanFileName('../../etc/pass<>wd.pdf'), 'pass__wd.pdf');
  assert.equal(cleanFileName('C:\\fakepath\\slides.pptx'), 'slides.pptx');
  assert.equal(validFileRename('a.pdf', 'Chapter 2'), 'Chapter 2.pdf');
  assert.equal(validFileRename('a.pdf', 'Chapter 2.pdf'), 'Chapter 2.pdf');
  assert.equal(validFileRename('a.docx', 'x.pdf'), 'x.pdf.docx');
  assert.throws(() => validFileRename('a.pdf', '  '), InputError);
});

test('precheck flags unsupported, empty and oversized files before upload', () => {
  assert.equal(precheckFile('a.pdf', 100), '');
  assert.match(precheckFile('a.exe', 100), /Unsupported/);
  assert.match(precheckFile('a.html', 100), /Unsupported/);
  assert.match(precheckFile('a.pdf', 0), /empty/);
  assert.equal(precheckFile('a.pdf', MAX_FILE_BYTES + 1), '');
  assert.match(precheckFile('a.pdf', MAX_PDF_BYTES + 1), /50 MB/);
  assert.match(precheckFile('a.txt', MAX_FILE_BYTES + 1), /4 MB/);
});

test('tree helpers: descendants, trail, unique names', () => {
  const items = [item('a', null, 'folder'), item('b', 'a', 'folder'), item('c', 'b', 'file'), item('d', null, 'file')];
  assert.deepEqual(descendants(items, 'a').map(i => i.id).sort(), ['b', 'c']);
  assert.deepEqual(trail(items, 'b')!.map(i => i.id), ['a', 'b']);
  assert.deepEqual(trail(items, null), []);
  assert.equal(trail(items, 'c'), null, 'a file is not a folder');
  assert.equal(trail(items, 'missing'), null);
  const loop = [item('x', 'y', 'folder'), item('y', 'x', 'folder')];
  assert.equal(trail(loop, 'x'), null, 'cyclic data cannot hang');
  assert.deepEqual(descendants(loop, 'x').length, 2);
  assert.equal(uniqueName('a.pdf', [item('1', null, 'file', 'A.pdf')]), 'a (2).pdf');
  assert.equal(uniqueName('a.pdf', []), 'a.pdf');
});

test('local backend: folders, files, rename, download, recursive delete', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'storage-'));
  const env = { ...process.env };
  delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SECRET_KEY; delete process.env.VERCEL;
  process.env.DATABASE_PATH = join(dir, 'test.sqlite');
  const s = await import('../lib/storage.ts');
  try {
    const week = await s.createFolder('OS', null, 'Week 1');
    const slides = await s.createFolder('OS', week.id, 'Slides');
    await assert.rejects(() => s.createFolder('OS', null, 'week 1'), /already exists/);
    await assert.rejects(() => s.createFolder('OS', '11111111-1111-4111-8111-111111111111', 'Ghost'), /no longer exists/);
    await assert.rejects(() => s.createFolder('OS', 'not-a-uuid', 'Bad'), /Invalid folder/);
    const f1 = await s.uploadFile('OS', slides.id, 'deck.pdf', pdf);
    const f2 = await s.uploadFile('OS', slides.id, 'deck.pdf', pdf);
    assert.equal(f2.name, 'deck (2).pdf');
    await assert.rejects(() => s.uploadFile('OS', null, 'x.exe', pdf), InputError);
    assert.equal((await s.listItems('OS')).length, 4);
    assert.equal((await s.listItems('FOA')).length, 0, 'subjects are isolated');
    const read = await s.readFileItem('OS', f1.id);
    assert.deepEqual(read.bytes, pdf); assert.equal(read.mime, 'application/pdf');
    await assert.rejects(() => s.readFileItem('FOA', f1.id), /not found/);
    await assert.rejects(() => s.readFileItem('OS', slides.id), /not found/, 'a folder is not downloadable');
    await s.renameItem('OS', f1.id, 'Final slides');
    assert.equal((await s.listItems('OS')).find(i => i.id === f1.id)!.name, 'Final slides.pdf');
    await assert.rejects(() => s.renameItem('OS', f2.id, 'Final slides'), /already exists/);
    await s.deleteItem('OS', week.id);
    assert.equal((await s.listItems('OS')).length, 0, 'deleting a folder removes everything inside');
    await assert.rejects(() => s.readFileItem('OS', f1.id), /not found/);
    await assert.rejects(() => s.listItems('../x'), /Invalid subject/);
    let deep: string | null = null;
    for (let i = 0; i < 6; i++) deep = (await s.createFolder('IWT', deep, 'L' + i)).id;
    await assert.rejects(() => s.createFolder('IWT', deep, 'too deep'), /nested up to/);
  } finally { process.env = env; }
});

test('cloud backend uses private server credentials, scoped paths and the Prefer header', async () => {
  const originalFetch = globalThis.fetch, env = { ...process.env };
  process.env.SUPABASE_URL = 'https://example.supabase.co'; process.env.SUPABASE_SECRET_KEY = 'sb_secret_test';
  const calls: { url: string; init: RequestInit }[] = [];
  const rows: Record<string, unknown>[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    const u = String(url), method = init.method || 'GET';
    if (u.includes('/rest/v1/storage_items')) {
      if (method === 'POST') { const row = JSON.parse(init.body as string); rows.push(row); return Response.json([row], { status: 201 }); }
      if (method === 'GET') return Response.json(rows);
      if (method === 'DELETE') { rows.length = 0; return new Response(null, { status: 204 }); }
    }
    return Response.json({});
  }) as typeof fetch;
  try {
    const specifier = '../lib/storage.ts?cloud'; // fresh module instance
    const s = (await import(specifier)) as typeof import('../lib/storage.ts');
    const folder = await s.createFolder('DBMS', null, 'Past papers');
    const file = await s.uploadFile('DBMS', folder.id, 'p1.pdf', pdf);
    const upload = calls.find(c => c.url.includes('/storage/v1/object/subject-storage/DBMS/'))!;
    assert.ok(upload.url.endsWith('/' + file.id)); assert.equal((upload.init.headers as Record<string, string>).apikey, 'sb_secret_test');
    const insert = calls.find(c => c.init.method === 'POST' && c.url.includes('/rest/v1/'))!;
    assert.equal((insert.init.headers as Record<string, string>).Prefer, 'return=representation');
    assert.ok(calls.some(c => c.url.includes('subject=eq.DBMS')));
    await s.deleteItem('DBMS', folder.id);
    const drop = calls.filter(c => c.init.method === 'DELETE' && c.url.includes('/storage/v1/object/subject-storage')).at(-1)!;
    assert.deepEqual(JSON.parse(drop.init.body as string), { prefixes: ['DBMS/' + file.id] });
    globalThis.fetch = (async () => new Response('secret internal details', { status: 500 })) as typeof fetch;
    await assert.rejects(() => s.listItems('DBMS'), (e: Error) => !(e instanceof InputError) && !/secret internal/.test(e.message));
  } finally { globalThis.fetch = originalFetch; process.env = env; }
});

test('large cloud PDFs use signed uploads and are verified before metadata is saved', async () => {
  const originalFetch = globalThis.fetch, env = { ...process.env };
  process.env.SUPABASE_URL = 'https://example.supabase.co'; process.env.SUPABASE_SECRET_KEY = 'sb_secret_test';
  const rows: Record<string, unknown>[] = [];
  globalThis.fetch = (async (url: string | URL | Request, init: RequestInit = {}) => {
    const u = String(url), method = init.method || 'GET';
    if (u.includes('/rest/v1/storage_items')) {
      if (method === 'POST') { const row = JSON.parse(init.body as string); rows.push(row); return Response.json([row], { status: 201 }); }
      return Response.json(rows);
    }
    if (u.includes('/object/upload/sign/')) return Response.json({ url: u.slice(u.indexOf('/object/upload/sign/')) + '?token=temporary' });
    if (u.includes('/object/subject-storage/OS/')) return new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]), { status: 206, headers: { 'content-range': `bytes 0-4/${MAX_PDF_BYTES}` } });
    if (u.includes('/object/sign/subject-storage/OS/')) return Response.json({ signedURL: '/object/sign/subject-storage/OS/file.pdf?token=temporary' });
    throw Error('Unexpected storage request');
  }) as typeof fetch;
  try {
    const specifier = '../lib/storage.ts?large-pdf';
    const s = await import(specifier) as typeof import('../lib/storage.ts');
    const prepared = await s.prepareFileUpload('OS', null, 'large.pdf', MAX_PDF_BYTES);
    assert.ok(prepared);
    assert.ok(prepared.signedUrl.startsWith('https://example.supabase.co/storage/v1/object/upload/sign/'));
    const item = await s.completeFileUpload('OS', null, prepared.id, 'large.pdf', MAX_PDF_BYTES);
    assert.equal(item.size, MAX_PDF_BYTES);
    assert.equal(rows.length, 1);
    const download = await s.signedFileDownload('OS', item.id, item.name);
    assert.equal(new URL(download).searchParams.get('download'), 'large.pdf');
  } finally { globalThis.fetch = originalFetch; process.env = env; }
});
