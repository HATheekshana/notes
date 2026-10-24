import { dirname, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { cloudConfigured, cloudRequired, supabaseRequest } from './supabase-repository.ts';
import { InputError } from './errors.ts';
import { DEFAULT_COURSES, allSubjects, defaultCurriculum, parseCurriculum, removedSubjectIds, subjectIdsOf, validateCurriculum, type Course, type Curriculum } from './curriculum-model.ts';
import { countItems } from './storage.ts';
import { listResources } from './resources.ts';

// ---- where the single curriculum record lives ---------------------------------------------------
type Found = { courses: Course[]; version: number };
interface Store {
  read(): Promise<Found | null | 'missing'>; // 'missing' = the table has not been created yet (supabase/curriculum.sql not run)
  create(courses: Course[]): Promise<boolean>;
  update(courses: Course[], expected: number): Promise<boolean>; // false when someone saved in between
}
const isMissingTable = (e: unknown) => { const x = e as { status?: number; code?: string }; return x?.code === 'PGRST205' || x?.code === '42P01' || x?.status === 404; };

const cloudStore: Store = {
  async read() {
    try {
      const rows: { data: unknown; version: number }[] = await supabaseRequest('curriculum?select=data,version&id=eq.1');
      if (!rows[0]) return null;
      const parsed = parseCurriculum({ version: rows[0].version, courses: rows[0].data });
      if (!parsed) throw Error('Stored curriculum is invalid.');
      return { courses: parsed.courses, version: parsed.version };
    } catch (e) { if (isMissingTable(e)) return 'missing'; throw e; }
  },
  async create(courses) {
    const rows: unknown[] = await supabaseRequest('curriculum?on_conflict=id', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=representation' }, body: JSON.stringify({ id: 1, data: courses, version: 1 }) });
    return rows.length === 1;
  },
  async update(courses, expected) {
    const rows: unknown[] = await supabaseRequest(`curriculum?id=eq.1&version=eq.${expected}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ data: courses, version: expected + 1, updated_at: new Date().toISOString() }) });
    return rows.length === 1;
  },
};

let local: Store | undefined;
async function localStore(): Promise<Store> {
  if (local) return local;
  const { DatabaseSync } = await import('node:sqlite'); // never loaded on Vercel
  const path = process.env.DATABASE_PATH || resolve('data/renxzero.sqlite');
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS curriculum (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL, version INTEGER NOT NULL, updated_at TEXT NOT NULL);');
  local = {
    read: async () => {
      const row = db.prepare('SELECT data, version FROM curriculum WHERE id = 1').get() as { data: string; version: number } | undefined;
      if (!row) return null;
      const parsed = parseCurriculum({ version: row.version, courses: JSON.parse(row.data) });
      if (!parsed) throw Error('Stored curriculum is invalid.');
      return { courses: parsed.courses, version: parsed.version };
    },
    create: async courses => Number(db.prepare('INSERT OR IGNORE INTO curriculum (id, data, version, updated_at) VALUES (1, ?, 1, ?)').run(JSON.stringify(courses), new Date().toISOString()).changes) === 1,
    update: async (courses, expected) => Number(db.prepare('UPDATE curriculum SET data = ?, version = ?, updated_at = ? WHERE id = 1 AND version = ?').run(JSON.stringify(courses), expected + 1, new Date().toISOString(), expected).changes) === 1,
  };
  return local;
}
async function store(): Promise<Store> {
  if (cloudConfigured()) return cloudStore;
  if (cloudRequired()) throw Error('Curriculum storage is not configured.');
  return localStore();
}

// ---- reading -------------------------------------------------------------------------------------------
// Before the administrator has saved anything (or before curriculum.sql has been run) the built-in
// five subjects are used, so the app keeps working exactly as before. Real outages throw instead of
// pretending the defaults are the truth.
export async function getCurriculum(): Promise<Curriculum> {
  const found = await (await store()).read();
  return found && found !== 'missing' ? found : defaultCurriculum;
}
export const subjectIds = async () => subjectIdsOf(await getCurriculum());
export async function requireSubject(id: string): Promise<string> {
  if (typeof id !== 'string' || !(await subjectIds()).includes(id)) throw new InputError('Invalid subject.');
  return id;
}

// ---- usage (what would be lost by deleting) -------------------------------------------------------
export type Deps = { notes(): Promise<Record<string, number>>; files(): Promise<Record<string, number>>; resources(subject: string): Promise<number> };
const defaultDeps: Deps = {
  notes: async () => {
    const { repository } = await import('./repository');
    const counts: Record<string, number> = {};
    for (const n of await (await repository()).list(true)) counts[n.subject] = (counts[n.subject] || 0) + 1;
    return counts;
  },
  files: countItems,
  resources: async subject => (await listResources(subject)).length,
};
// Notes and files per subject, shown in the editor. (PDF resources are checked when a subject is actually removed.)
export async function subjectUsage(deps: Deps = defaultDeps): Promise<Record<string, { notes: number; files: number }>> {
  const [notes, files] = await Promise.all([deps.notes(), deps.files()]);
  const out: Record<string, { notes: number; files: number }> = {};
  for (const id of new Set([...Object.keys(notes), ...Object.keys(files)])) out[id] = { notes: notes[id] || 0, files: files[id] || 0 };
  return out;
}

async function assertRemovable(removed: string[], before: Course[], deps: Deps) {
  if (!removed.length) return;
  const names = new Map(allSubjects({ version: 0, courses: before }).map(s => [s.id, s.name]));
  const [notes, files] = await Promise.all([deps.notes(), deps.files()]);
  const blocked: string[] = [];
  for (const id of removed) {
    const parts: string[] = [];
    if (notes[id]) parts.push(`${notes[id]} ${notes[id] === 1 ? 'note' : 'notes'}`);
    if (files[id]) parts.push(`${files[id]} ${files[id] === 1 ? 'file or folder' : 'files and folders'}`);
    let pdfs = 0;
    try { pdfs = await deps.resources(id); } catch { throw new InputError(`Could not check the PDFs in ${id}. Try again in a moment.`); } // unknown = not safe to delete
    if (pdfs) parts.push(`${pdfs} ${pdfs === 1 ? 'PDF' : 'PDFs'}`);
    if (parts.length) blocked.push(`“${id}” (${names.get(id) || id}) still has ${parts.join(' and ')}`);
  }
  if (blocked.length) throw new InputError(`A subject that still has content cannot be removed: ${blocked.slice(0, 3).join('; ')}${blocked.length > 3 ? `; and ${blocked.length - 3} more` : ''}. Delete or move that content first.`);
}

// ---- saving -----------------------------------------------------------------------------------------------
export async function saveCurriculum(input: unknown, deps: Deps = defaultDeps): Promise<Curriculum> {
  if (!input || typeof input !== 'object') throw new InputError('Invalid request.');
  const { version, courses: raw } = input as { version?: unknown; courses?: unknown };
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 0) throw new InputError('Invalid request.');
  const courses = validateCurriculum(raw);
  const db = await store(), found = await db.read();
  if (found === 'missing') throw Object.assign(new InputError('Courses & subjects are not set up in the database yet. Run supabase/curriculum.sql in the Supabase SQL Editor, then try again.'), { code: 'SETUP' });
  const current: Found = found ?? { courses: DEFAULT_COURSES, version: 0 };
  if (version !== current.version) throw Object.assign(new InputError('This was changed somewhere else. Reload the page to see the latest version, then make your change again.'), { code: 'CONFLICT' });
  await assertRemovable(removedSubjectIds(current.courses, courses), current.courses, deps);
  const saved = found === null ? await db.create(courses) : await db.update(courses, current.version);
  if (!saved) throw Object.assign(new InputError('This was changed somewhere else. Reload the page to see the latest version, then make your change again.'), { code: 'CONFLICT' });
  return { version: current.version + 1, courses };
}
