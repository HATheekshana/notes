// Pure helpers for the offline app: what changed between the notes saved on the phone and the server's.
// No browser APIs here, so it can be shared by the page, the service worker logic and the tests.
export type SyncNote = { id: string; subject: string; title: string; content: string; tags: string[]; published: boolean; updatedAt: string };
export type NotesDiff = { added: SyncNote[]; changed: SyncNote[]; removed: SyncNote[] };

// Offline copies only ever hold published notes, so drafts never leak onto a device.
export const publishedOnly = <T extends { published: boolean }>(notes: T[]): T[] => notes.filter(n => n.published);

export function diffNotes(local: SyncNote[], remote: SyncNote[]): NotesDiff {
  const mine = new Map(local.map(n => [n.id, n]));
  const theirs = new Map(remote.map(n => [n.id, n]));
  return {
    added: remote.filter(n => !mine.has(n.id)),
    changed: remote.filter(n => { const old = mine.get(n.id); return !!old && (old.updatedAt !== n.updatedAt || old.title !== n.title || old.subject !== n.subject); }),
    removed: local.filter(n => !theirs.has(n.id)),
  };
}
export const hasChanges = (d: NotesDiff) => d.added.length + d.changed.length + d.removed.length > 0;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
export function describeDiff(d: NotesDiff): string {
  const parts = [d.added.length && `${plural(d.added.length, 'new note')}`, d.changed.length && `${plural(d.changed.length, 'updated note')}`, d.removed.length && `${plural(d.removed.length, 'removed note')}`].filter(Boolean);
  return parts.join(', ') || 'No changes';
}

// A short fingerprint so we can tell "the same update we already asked about" from a new one.
export const diffSignature = (d: NotesDiff) => [...d.added, ...d.changed].map(n => n.id + '@' + n.updatedAt).sort().concat(d.removed.map(n => '-' + n.id).sort()).join('|');

export type Snapshot = { savedAt: string; notes: SyncNote[] };
export function parseSnapshot(raw: unknown): Snapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Partial<Snapshot>;
  if (typeof s.savedAt !== 'string' || !Array.isArray(s.notes)) return null;
  const notes = s.notes.filter((n): n is SyncNote => !!n && typeof n.id === 'string' && typeof n.title === 'string' && typeof n.content === 'string' && typeof n.updatedAt === 'string' && typeof n.subject === 'string' && Array.isArray(n.tags) && n.published === true);
  return { savedAt: s.savedAt, notes };
}

export const noteUrl = (id: string) => '/notes/' + encodeURIComponent(id);
// Pages that must be available offline for navigation to keep working without a network (one set per subject in the curriculum).
export const corePages = (subjectIds: string[]) => ['/', ...subjectIds.map(s => '/subjects/' + s), ...subjectIds.map(s => '/subjects/' + s + '/storage')];
