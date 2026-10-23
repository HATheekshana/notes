/* UNINotes service worker. Plain JS on purpose (no build step).
   - Keeps the app usable offline (pages, scripts, lists) and serves files the user chose to save.
   - Never saves or updates notes by itself: it only checks for changes and shows a notification.
   Cache names MUST match lib/offline.ts. */
const STATIC = 'rz-static-v1', PAGES = 'rz-pages-v1', API = 'rz-api-v1', FILES = 'rz-files', META = 'rz-meta';
const KEEP = [STATIC, PAGES, API, FILES, META];
const SNAPSHOT = '/__rz/snapshot.json';
const MAX_STATIC_ENTRIES = 200;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    try { await (await caches.open(PAGES)).add('/'); } catch (e) { /* offline during install: the shell is cached on first visit instead */ }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) if (name.startsWith('rz-') && !KEEP.includes(name)) await caches.delete(name);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.headers.get('RSC') || url.searchParams.has('_rsc')) return; // Next.js router data: always live
  const path = url.pathname;
  if (path.startsWith('/_next/static/')) return event.respondWith(cacheFirst(request, STATIC));
  if (path === '/api/storage' || path === '/api/resources') {
    const isFile = url.searchParams.has('id') || url.searchParams.has('key');
    return event.respondWith(isFile ? savedFileFirst(request) : networkFirst(request, API));
  }
  if (path.startsWith('/api/')) return; // notes and session are handled by the app itself (lib/offline.ts)
  if (request.mode === 'navigate') return event.respondWith(navigate(event));
  if (path.startsWith('/icons/') || path === '/favicon.svg' || path === '/manifest.webmanifest') return event.respondWith(cacheFirst(request, STATIC));
});

async function trim(cache, max) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]); // oldest first
}

async function cacheFirst(request, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) { await cache.put(request, response.clone()); await trim(cache, MAX_STATIC_ENTRIES); }
  return response;
}

const offlineJson = () => new Response(JSON.stringify({ error: 'You are offline.' }), { status: 503, headers: { 'Content-Type': 'application/json' } });

// Lists (folders, PDFs): live when possible, last known copy when not.
async function networkFirst(request, name) {
  const cache = await caches.open(name);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    else { const stale = await cache.match(request); if (stale) return stale; }
    return response;
  } catch (e) {
    return (await cache.match(request)) || offlineJson();
  }
}

// Files: only ever served from the cache if the user saved them. Never saved automatically.
async function savedFileFirst(request) {
  const hit = await caches.match(request, { cacheName: FILES });
  if (hit) return hit;
  try { return await fetch(request); }
  catch (e) { return new Response('You are offline and this file is not saved on your phone.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }); }
}

const offlinePage = () => new Response('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline</title><body style="font-family:system-ui;padding:2rem;max-width:30rem;margin:auto"><h1>You are offline</h1><p>This page has not been saved yet. Connect to the internet once to open it, then it will work offline.</p>', { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
const pageKey = url => { const u = new URL(url); u.search = ''; return u.href; };

// Pages: live when the network is healthy (so deploys show up), the saved copy when offline or very slow.
async function navigate(event) {
  const request = event.request, cache = await caches.open(PAGES), key = pageKey(request.url);
  const cached = (await cache.match(key)) || (await cache.match(pageKey(self.location.origin + '/')));
  const network = fetch(request).then(async response => {
    if (response.ok && !response.redirected && (response.headers.get('Content-Type') || '').includes('text/html')) await cache.put(key, response.clone());
    return response;
  });
  if (!cached) return network.catch(offlinePage);
  event.waitUntil(network.catch(() => {})); // let a slow request finish and refresh the cache
  const slow = new Promise(resolve => setTimeout(() => resolve(cached), 3500));
  return Promise.race([network, slow]).catch(() => cached);
}

// ---- update checks (never applies anything) ----------------------------------------------------------
function diffNotes(local, remote) {
  const mine = new Map(local.map(n => [n.id, n])), theirs = new Map(remote.map(n => [n.id, n]));
  return {
    added: remote.filter(n => !mine.has(n.id)),
    changed: remote.filter(n => { const old = mine.get(n.id); return !!old && (old.updatedAt !== n.updatedAt || old.title !== n.title || old.subject !== n.subject); }),
    removed: local.filter(n => !theirs.has(n.id)),
  };
}
function describe(d) {
  const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
  return [d.added.length && plural(d.added.length, 'new note'), d.changed.length && plural(d.changed.length, 'updated note'), d.removed.length && plural(d.removed.length, 'removed note')].filter(Boolean).join(', ');
}

async function checkForUpdates() {
  const meta = await caches.open(META), stored = await meta.match(SNAPSHOT);
  if (!stored) return; // the app has not saved any notes on this device yet
  const saved = await stored.json();
  let remote;
  try { const response = await fetch('/api/notes', { cache: 'no-store' }); if (!response.ok) return; remote = (await response.json()).filter(n => n.published); } catch (e) { return; }
  const diff = diffNotes(saved.notes || [], remote);
  if (!(diff.added.length + diff.changed.length + diff.removed.length)) return;
  const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  if (open.some(c => c.visibilityState === 'visible')) return; // the app is on screen and shows its own prompt
  await self.registration.showNotification('New notes available', {
    body: describe(diff) + '. Tap to update.', tag: 'notes-update', icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', data: { url: '/' },
    actions: [{ action: 'update', title: 'Update now' }, { action: 'later', title: 'Later' }],
  });
}

self.addEventListener('periodicsync', event => { if (event.tag === 'check-updates') event.waitUntil(checkForUpdates()); });

self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'later') return;
  const target = event.action === 'update' ? '/?apply-update=1' : '/';
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if ('focus' in client) {
        await client.focus();
        if (event.action === 'update' && 'navigate' in client) { try { await client.navigate(target); } catch (e) { /* keep the open page */ } }
        return;
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(target);
  })());
});
