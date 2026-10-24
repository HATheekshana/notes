// Browser-side offline support for the installable app (PWA).
// Everything is stored with the standard Cache API, so the service worker (public/sw.js) can read the
// same data. Cache names here MUST match public/sw.js.
import { defaultCurriculum, parseCurriculum, type Curriculum } from './curriculum-model.ts';
import { corePages, diffNotes, describeDiff, hasChanges, noteUrl, parseSnapshot, publishedOnly, type NotesDiff, type Snapshot, type SyncNote } from './sync-model.ts';

export const CACHE = { meta: 'rz-meta', files: 'rz-files', pages: 'rz-pages-v1' } as const;
export const SNAPSHOT_URL = '/__rz/snapshot.json';
export const CURRICULUM_URL = '/__rz/curriculum.json';

export type Pending = { diff: NotesDiff; remote: SyncNote[] };
export type WorkspaceData = { curriculum: Curriculum; notes: SyncNote[]; admin: boolean; configured: boolean; offline: boolean; pending: Pending | null; savedAt: string | null };

class Offline extends Error {}
const absolute = (path: string) => new URL(path, location.origin).href;
export const cacheSupported = () => typeof caches !== 'undefined';
// Installed from the home screen (Android: display-mode standalone, iOS: navigator.standalone)
export const isStandalone = () => typeof window !== 'undefined' && (!!window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true);

async function getJson(url: string) {
  let response: Response;
  try { response = await fetch(url, { cache: 'no-store' }); } catch { throw new Offline('offline'); } // fetch only rejects when there is no network
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Error(data.error || 'Something went wrong.'); // a server problem is not "offline"
  return data;
}

// ---- the notes saved on this phone ----------------------------------------------------------
export async function readSnapshot(): Promise<Snapshot | null> {
  if (!cacheSupported()) return null;
  try { const hit = await (await caches.open(CACHE.meta)).match(SNAPSHOT_URL); return hit ? parseSnapshot(await hit.json()) : null; } catch { return null; }
}
export async function writeSnapshot(notes: SyncNote[]): Promise<Snapshot> {
  const snapshot: Snapshot = { savedAt: new Date().toISOString(), notes: publishedOnly(notes) };
  if (cacheSupported()) await (await caches.open(CACHE.meta)).put(SNAPSHOT_URL, new Response(JSON.stringify(snapshot), { headers: { 'Content-Type': 'application/json' } }));
  return snapshot;
}

// ---- the courses / semesters / subjects ----------------------------------------------------------------------
// Unlike notes, the structure is always taken live when online (it is just the shape of the app) and
// kept for offline use. It never fails the app: offline or on a server problem the saved copy is used.
export async function readCachedCurriculum(): Promise<Curriculum | null> {
  if (!cacheSupported()) return null;
  try { const hit = await (await caches.open(CACHE.meta)).match(CURRICULUM_URL); return hit ? parseCurriculum(await hit.json()) : null; } catch { return null; }
}
export async function writeCachedCurriculum(curriculum: Curriculum) {
  if (cacheSupported()) await (await caches.open(CACHE.meta)).put(CURRICULUM_URL, new Response(JSON.stringify(curriculum), { headers: { 'Content-Type': 'application/json' } }));
}
export async function loadCurriculum(): Promise<Curriculum> {
  const cached = readCachedCurriculum();
  try {
    const [saved, response] = await Promise.all([cached, getJson('/api/curriculum')]);
    const live = parseCurriculum(response);
    if (live) {
      if (live.version === 0 && saved && saved.version > 0) return saved; // never replace a saved curriculum with the built-in default
      await writeCachedCurriculum(live).catch(() => {});
      return live;
    }
  } catch { /* offline or server problem */ }
  return await cached || defaultCurriculum;
}

// Loads what the workspace shows.
//  - Browser tab or administrator: always live from the server (and keeps a copy for offline use).
//  - Installed app, reader: shows the saved copy and, if the server has newer notes, reports them as
//    `pending` so the app can ASK before updating.
//  - No network: shows the saved copy.
export async function loadWorkspaceData(): Promise<WorkspaceData> {
  const notesRequest = getJson('/api/notes').then(
    value => ({ value }),
    error => ({ error }),
  );
  try {
    const [session, curriculum] = await Promise.all([getJson('/api/session'), loadCurriculum()]);
    const notesResult = await notesRequest;
    const live = !isStandalone() || session.admin;
    if (live) {
      if ('error' in notesResult) throw notesResult.error;
      const notes: SyncNote[] = notesResult.value;
      await writeSnapshot(notes).catch(() => {});
      return { curriculum, notes, admin: !!session.admin, configured: session.configured !== false, offline: false, pending: null, savedAt: null };
    }
    const saved = await readSnapshot();
    if (!saved) {
      if ('error' in notesResult) throw notesResult.error;
      const remote = publishedOnly(notesResult.value as SyncNote[]);
      const first = await writeSnapshot(remote);
      return { curriculum, notes: remote, admin: false, configured: session.configured !== false, offline: false, pending: null, savedAt: first.savedAt };
    }
    let pending: Pending | null = null;
    try {
      if ('error' in notesResult) throw notesResult.error;
      const remote = publishedOnly(notesResult.value as SyncNote[]), diff = diffNotes(saved.notes, remote);
      if (hasChanges(diff)) pending = { diff, remote };
    } catch (e) { if (!(e instanceof Offline)) { /* server hiccup: keep showing saved notes */ } }
    return { curriculum, notes: saved.notes, admin: false, configured: session.configured !== false, offline: false, pending, savedAt: saved.savedAt };
  } catch (e) {
    if (!(e instanceof Offline)) throw e;
    const saved = await readSnapshot();
    if (!saved) throw Error('You are offline and no notes are saved on this device yet. Open the app once with internet.');
    return { curriculum: await readCachedCurriculum() || defaultCurriculum, notes: saved.notes, admin: false, configured: true, offline: true, pending: null, savedAt: saved.savedAt };
  }
}

// Re-check later (app comes back online / is reopened). 'offline' = no network, null = nothing new.
export async function checkPending(): Promise<Pending | null | 'offline'> {
  const saved = await readSnapshot();
  if (!saved) return null;
  try {
    const remote = publishedOnly(await getJson('/api/notes') as SyncNote[]), diff = diffNotes(saved.notes, remote);
    return hasChanges(diff) ? { diff, remote } : null;
  } catch (e) { return e instanceof Offline ? 'offline' : null; }
}

// The user said "Update now": save the new notes and make their pages available offline.
export async function applyUpdate(pending: Pending): Promise<Snapshot> {
  const snapshot = await writeSnapshot(pending.remote);
  void warmPages([...pending.diff.added, ...pending.diff.changed].map(n => noteUrl(n.id)));
  return snapshot;
}

// ---- pages: the app shell for every route must be cached, because offline navigation reloads the page ----
export async function warmPages(urls: string[]) {
  if (!cacheSupported()) return;
  const cache = await caches.open(CACHE.pages), queue = [...new Set(urls)];
  const worker = async () => {
    for (let url = queue.shift(); url; url = queue.shift()) {
      try { if (await cache.match(absolute(url))) continue; const response = await fetch(url, { credentials: 'same-origin' }); if (response.ok) await cache.put(absolute(url), response); } catch { /* best effort */ }
    }
  };
  await Promise.all([worker(), worker(), worker()]);
}
export const warmNotePages = (notes: SyncNote[], subjectIds: string[]) => warmPages([...corePages(subjectIds), ...notes.map(n => noteUrl(n.id))]);

// ---- files saved for offline use (only when the user asks) ----------------------------------
export async function savedFileKeys(): Promise<Set<string>> {
  if (!cacheSupported()) return new Set();
  try { return new Set((await (await caches.open(CACHE.files)).keys()).map(r => r.url)); } catch { return new Set(); }
}
export async function saveFile(path: string): Promise<number> {
  if (!cacheSupported()) throw Error('Saving files is not supported in this browser.');
  const key = absolute(path);
  let response: Response;
  try { response = await fetch(key, { credentials: 'same-origin', cache: 'no-store' }); } catch { throw Error('You are offline. Connect to the internet to save this file.'); }
  if (!response.ok) { const data = await response.json().catch(() => ({})); throw Error(data.error || 'Could not save this file.'); }
  const blob = await response.blob();
  const headers = new Headers({ 'Content-Type': response.headers.get('Content-Type') || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'X-Saved-At': new Date().toISOString() });
  const disposition = response.headers.get('Content-Disposition'); if (disposition) headers.set('Content-Disposition', disposition);
  await (await caches.open(CACHE.files)).put(key, new Response(blob, { headers }));
  return blob.size;
}
export async function removeSavedFile(path: string) { if (cacheSupported()) await (await caches.open(CACHE.files)).delete(absolute(path)); }
export const fileKey = absolute;

// ---- install, alerts, registration --------------------------------------------------------------
export async function registerPwa(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator) || process.env.NODE_ENV !== 'production') return null;
  try {
    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    if (isStandalone()) void navigator.storage?.persist?.().catch(() => {}); // ask Android not to clear saved notes/files when storage is low
    return registration;
  } catch { return null; }
}
export const alertsSupported = () => typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator;

// Must be called from a tap. Also asks Chrome to check for updates in the background now and then.
export async function enableAlerts(): Promise<NotificationPermission | 'unsupported'> {
  if (!alertsSupported()) return 'unsupported';
  const permission = await Notification.requestPermission();
  if (permission === 'granted') {
    try {
      const registration = await navigator.serviceWorker.ready as ServiceWorkerRegistration & { periodicSync?: { register(tag: string, options: { minInterval: number }): Promise<void> } };
      await registration.periodicSync?.register('check-updates', { minInterval: 12 * 60 * 60 * 1000 });
    } catch { /* unsupported or not allowed yet: alerts still work while the app is open */ }
  }
  return permission;
}

export async function notifyUpdate(diff: NotesDiff) {
  if (!alertsSupported() || Notification.permission !== 'granted') return;
  const registration = await navigator.serviceWorker.ready;
  await registration.showNotification('New notes available', {
    body: describeDiff(diff) + '. Tap to update.', tag: 'notes-update', icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', data: { url: '/' },
    actions: [{ action: 'update', title: 'Update now' }, { action: 'later', title: 'Later' }],
  } as NotificationOptions);
}
