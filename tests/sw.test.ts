import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { APP, FakeCacheStorage } from './fake-caches.ts';
import { diffNotes as modelDiff, describeDiff, type SyncNote } from '../lib/sync-model.ts';

type Env = { fetch: (req: any) => Promise<Response>; windows: any[]; opened: string[]; shown: any[]; slowMs?: number };
const note = (id: string, over: Partial<SyncNote> = {}): SyncNote => ({ id, subject: 'FOA', title: 'Note ' + id, content: 'x', tags: [], published: true, updatedAt: '2026-10-01T00:00:00Z', ...over });
const req = (path: string, init: { mode?: string; method?: string; headers?: Record<string, string> } = {}) => ({ url: new URL(path, APP).href, method: init.method || 'GET', mode: init.mode || 'cors', headers: new Headers(init.headers) });
const nav = (path: string) => req(path, { mode: 'navigate' });

function boot(fetchImpl: Env['fetch'] = async () => new Response('', { status: 404 })) {
  const handlers: Record<string, (e: any) => void> = {};
  const env: Env = { fetch: fetchImpl, windows: [], opened: [], shown: [] };
  const caches = new FakeCacheStorage(url => env.fetch({ url, method: 'GET', mode: 'navigate', headers: new Headers() })); // cache.add() goes through the worker's network
  const self = {
    location: new URL(APP + '/'), addEventListener: (t: string, fn: (e: any) => void) => { handlers[t] = fn; }, skipWaiting: async () => {},
    clients: { claim: async () => {}, matchAll: async () => env.windows, openWindow: async (u: string) => { env.opened.push(u); } },
    registration: { showNotification: async (title: string, options: any) => { env.shown.push({ title, options }); } },
  };
  const context = vm.createContext({ self, caches, fetch: (r: any) => env.fetch(r), Response, Request, URL, Headers, Promise, JSON, Map, console, setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms >= 3000 ? 15 : ms) });
  vm.runInContext(readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'), context);
  return { handlers, caches, env, context };
}
type SW = ReturnType<typeof boot>;

// Fires a fetch event; returns null when the worker does not intercept the request.
async function fetchVia(sw: SW, request: any): Promise<Response | null> {
  let responded: Promise<Response> | undefined; const waits: Promise<unknown>[] = [];
  sw.handlers.fetch({ request, respondWith: (p: Promise<Response>) => { responded = Promise.resolve(p); }, waitUntil: (p: Promise<unknown>) => waits.push(p) });
  if (!responded) return null;
  const response = await responded; await Promise.all(waits.map(w => w.catch(() => {}))); return response;
}
const lifecycle = async (sw: SW, type: string, extra: Record<string, unknown> = {}) => { const waits: Promise<unknown>[] = []; sw.handlers[type]({ waitUntil: (p: Promise<unknown>) => waits.push(p), ...extra }); await Promise.all(waits); };
const json = (data: unknown, status = 200) => Response.json(data, { status });
const offlineFetch: Env['fetch'] = async () => { throw new TypeError('Failed to fetch'); };

test('install caches the app shell; activate removes old caches but never the saved notes or files', async () => {
  const sw = boot(async r => new Response('<html>home</html>', { headers: { 'Content-Type': 'text/html' } }));
  await lifecycle(sw, 'install');
  assert.ok(await (await sw.caches.open('rz-pages-v1')).match('/'), 'shell cached at install');
  for (const name of ['rz-static-v0', 'rz-api-v0', 'rz-files', 'rz-meta', 'other-app']) await sw.caches.open(name);
  await lifecycle(sw, 'activate');
  const left = await sw.caches.keys();
  assert.ok(left.includes('rz-files') && left.includes('rz-meta'), 'user data survives upgrades');
  assert.ok(!left.includes('rz-static-v0') && !left.includes('rz-api-v0'), 'stale versions removed');
  assert.ok(left.includes('other-app'), 'does not touch caches it does not own');
});

test('requests the worker must not touch are left alone', async () => {
  const sw = boot();
  assert.equal(await fetchVia(sw, req('/api/storage', { method: 'POST' })), null, 'uploads and edits');
  assert.equal(await fetchVia(sw, req('/api/notes')), null, 'notes are handled by the app, never by the worker');
  assert.equal(await fetchVia(sw, req('/api/session')), null);
  assert.equal(await fetchVia(sw, req('/subjects/FOA?_rsc=abc')), null, 'Next.js router data');
  assert.equal(await fetchVia(sw, req('/subjects/FOA', { headers: { RSC: '1' } })), null);
  assert.equal(await fetchVia(sw, { ...req('/x'), url: 'https://cdn.other.test/x.js' }), null, 'other sites');
});

test('built scripts are cached forever (hashed names), icons too, and the cache is capped', async () => {
  let hits = 0;
  const sw = boot(async () => { hits++; return new Response('js', { headers: { 'Content-Type': 'application/javascript' } }); });
  await fetchVia(sw, req('/_next/static/chunks/app.js')); await fetchVia(sw, req('/_next/static/chunks/app.js'));
  assert.equal(hits, 1, 'second request served from cache');
  sw.env.fetch = offlineFetch;
  assert.equal(await (await fetchVia(sw, req('/_next/static/chunks/app.js')))!.text(), 'js', 'works offline');
  sw.env.fetch = async () => new Response('png');
  await fetchVia(sw, req('/icons/icon-192.png'));
  for (let i = 0; i < 230; i++) await fetchVia(sw, req('/_next/static/chunks/c' + i + '.js'));
  assert.ok((await (await sw.caches.open('rz-static-v1')).keys()).length <= 200, 'static cache capped');
});

test('folder and PDF lists: live when online, last copy when offline, clear error when never seen', async () => {
  let body: unknown = [{ id: 1 }];
  const sw = boot(async () => json(body));
  const list = req('/api/storage?subject=FOA');
  assert.deepEqual(await (await fetchVia(sw, list))!.json(), [{ id: 1 }]);
  body = [{ id: 1 }, { id: 2 }];
  assert.equal((await (await fetchVia(sw, list))!.json()).length, 2, 'online always fetches fresh');
  sw.env.fetch = offlineFetch;
  assert.equal((await (await fetchVia(sw, list))!.json()).length, 2, 'offline shows the last copy');
  sw.env.fetch = async () => json({ error: 'down' }, 503);
  assert.equal((await (await fetchVia(sw, list))!.json()).length, 2, 'a server error also falls back to the last copy');
  sw.env.fetch = offlineFetch;
  const never = await fetchVia(sw, req('/api/resources?subject=OS'));
  assert.equal(never!.status, 503); assert.deepEqual(await never!.json(), { error: 'You are offline.' });
});

test('files come from the device only if the user saved them; nothing is saved automatically', async () => {
  const sw = boot(async () => new Response('SERVER-BYTES', { headers: { 'Content-Type': 'application/pdf' } }));
  const file = req('/api/storage?subject=FOA&id=abc&view=1');
  assert.equal(await (await fetchVia(sw, file))!.text(), 'SERVER-BYTES');
  assert.equal(await (await sw.caches.open('rz-files')).match(file), undefined, 'viewing a file does not save it');
  sw.env.fetch = offlineFetch;
  const missing = await fetchVia(sw, file);
  assert.equal(missing!.status, 503); assert.match(await missing!.text(), /not saved on your phone/);
  await (await sw.caches.open('rz-files')).put(file, new Response('SAVED-BYTES', { headers: { 'Content-Type': 'application/pdf' } }));
  const saved = await fetchVia(sw, file);
  assert.equal(await saved!.text(), 'SAVED-BYTES'); assert.equal(saved!.headers.get('Content-Type'), 'application/pdf');
  sw.env.fetch = async () => new Response('SERVER-BYTES');
  assert.equal(await (await fetchVia(sw, file))!.text(), 'SAVED-BYTES', 'saved copy wins');
});

test('pages: fresh online, saved copy offline, shell as fallback, and a friendly page as a last resort', async () => {
  const sw = boot(async r => new Response('<html>' + new URL(r.url).pathname + '</html>', { headers: { 'Content-Type': 'text/html' } }));
  await lifecycle(sw, 'install');
  assert.equal(await (await fetchVia(sw, nav('/subjects/FOA')))!.text(), '<html>/subjects/FOA</html>');
  sw.env.fetch = offlineFetch;
  assert.equal(await (await fetchVia(sw, nav('/subjects/FOA')))!.text(), '<html>/subjects/FOA</html>', 'visited page works offline');
  assert.equal(await (await fetchVia(sw, nav('/subjects/FOA?x=1')))!.text(), '<html>/subjects/FOA</html>', 'query strings ignored');
  assert.equal(await (await fetchVia(sw, nav('/notes/never-seen')))!.text(), '<html>/</html>', 'unvisited page falls back to the app shell');
  const empty = boot(offlineFetch);
  const last = await fetchVia(empty, nav('/'));
  assert.equal(last!.status, 503); assert.match(await last!.text(), /You are offline/);
});

test('pages: a slow network waits for fresh content instead of showing a stale page', async () => {
  const sw = boot(async r => new Response('<html>fresh</html>', { headers: { 'Content-Type': 'text/html' } }));
  await fetchVia(sw, nav('/subjects/OS'));
  sw.env.fetch = () => new Promise(resolve => setTimeout(() => resolve(new Response('<html>fresh2</html>', { headers: { 'Content-Type': 'text/html' } })), 40));
  assert.equal(await (await fetchVia(sw, nav('/subjects/OS')))!.text(), '<html>fresh2</html>', 'fresh page shown after the network responds');
  assert.equal(await (await (await sw.caches.open('rz-pages-v1')).match('/subjects/OS'))!.text(), '<html>fresh2</html>', 'fresh page replaces the cached copy');
});

test('pages: redirects and non-HTML are not saved as pages', async () => {
  const sw = boot(async () => new Response('{"a":1}', { headers: { 'Content-Type': 'application/json' } }));
  await fetchVia(sw, nav('/weird'));
  assert.equal(await (await sw.caches.open('rz-pages-v1')).match('/weird'), undefined);
});

async function withSnapshot(sw: SW, notes: SyncNote[]) { await (await sw.caches.open('rz-meta')).put('/__rz/snapshot.json', new Response(JSON.stringify({ savedAt: 'x', notes }))); }
const periodic = (sw: SW) => lifecycle(sw, 'periodicsync', { tag: 'check-updates' });

test('background check: notifies about changes but NEVER changes the saved notes', async () => {
  const saved = [note('a'), note('b')];
  const sw = boot(async () => json([note('a'), note('b', { updatedAt: '2026-10-09T00:00:00Z' }), note('c'), note('draft', { published: false })]));
  await withSnapshot(sw, saved);
  await periodic(sw);
  assert.equal(sw.env.shown.length, 1);
  const { title, options } = sw.env.shown[0];
  assert.equal(title, 'New notes available');
  assert.equal(options.body, '1 new note, 1 updated note. Tap to update.', 'drafts are not counted');
  assert.deepEqual([...options.actions.map((a: any) => a.action)], ['update', 'later']); // spread: the array comes from the sandbox realm
  assert.equal(options.tag, 'notes-update');
  const after = await (await (await sw.caches.open('rz-meta')).match('/__rz/snapshot.json'))!.json();
  assert.deepEqual(after.notes.map((n: SyncNote) => n.id), ['a', 'b'], 'saved notes untouched');
});

test('background check stays quiet when it should', async () => {
  const same = [note('a')];
  let sw = boot(async () => json(same)); await withSnapshot(sw, same); await periodic(sw);
  assert.equal(sw.env.shown.length, 0, 'no changes');
  sw = boot(async () => json([note('a'), note('b')])); await periodic(sw);
  assert.equal(sw.env.shown.length, 0, 'no saved notes yet');
  sw = boot(async () => json([note('a'), note('b')])); await withSnapshot(sw, same); sw.env.windows = [{ visibilityState: 'visible' }]; await periodic(sw);
  assert.equal(sw.env.shown.length, 0, 'app is on screen and shows its own prompt');
  sw = boot(offlineFetch); await withSnapshot(sw, same); await periodic(sw);
  assert.equal(sw.env.shown.length, 0, 'offline');
  sw = boot(async () => json({ error: 'down' }, 503)); await withSnapshot(sw, same); await periodic(sw);
  assert.equal(sw.env.shown.length, 0, 'server error');
  sw = boot(async () => json([note('a'), note('b')])); await withSnapshot(sw, same); await lifecycle(sw, 'periodicsync', { tag: 'something-else' });
  assert.equal(sw.env.shown.length, 0, 'other sync tags ignored');
});

test('notification buttons: Update now opens the app and applies; Later does nothing; tapping the body just opens', async () => {
  const click = async (sw: SW, action: string) => { let closed = false; await lifecycle(sw, 'notificationclick', { action, notification: { close: () => { closed = true; } } }); return closed; };
  let sw = boot(); assert.equal(await click(sw, 'later'), true); assert.deepEqual(sw.env.opened, []);
  sw = boot(); await click(sw, 'update'); assert.deepEqual(sw.env.opened, ['/?apply-update=1']);
  sw = boot(); await click(sw, ''); assert.deepEqual(sw.env.opened, ['/']);
  sw = boot(); const calls: string[] = [];
  sw.env.windows = [{ focus: async () => { calls.push('focus'); }, navigate: async (u: string) => { calls.push('navigate ' + u); } }];
  await click(sw, 'update'); assert.deepEqual(calls, ['focus', 'navigate /?apply-update=1'], 'reuses the open window'); assert.deepEqual(sw.env.opened, []);
  sw = boot(); const plain: string[] = []; sw.env.windows = [{ focus: async () => { plain.push('focus'); }, navigate: async () => { plain.push('navigate'); } }];
  await click(sw, ''); assert.deepEqual(plain, ['focus'], 'body tap only focuses');
});

test('the worker and the page compare notes identically', () => {
  const sw = boot();
  const swDiff = vm.runInContext('diffNotes', sw.context) as typeof modelDiff, swDescribe = vm.runInContext('describe', sw.context) as (d: ReturnType<typeof modelDiff>) => string;
  const local = [note('a'), note('b'), note('c'), note('s')];
  const remote = [note('a'), note('b', { updatedAt: 'new' }), note('t', { title: 'new' }), note('s', { subject: 'OS' })];
  const strip = (d: ReturnType<typeof modelDiff>) => JSON.parse(JSON.stringify({ a: d.added.map(n => n.id), c: d.changed.map(n => n.id), r: d.removed.map(n => n.id) }));
  assert.deepEqual(strip(swDiff(local, remote)), strip(modelDiff(local, remote)));
  assert.equal(swDescribe(swDiff(local, remote)), describeDiff(modelDiff(local, remote)));
});
