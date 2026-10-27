import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { cloudConfigured, cloudRequired, supabaseRequest } from './supabase-repository.ts';
import { InputError, MAX_DEPTH, MAX_FILE_BYTES, MAX_PDF_BYTES, MAX_ITEMS_PER_SUBJECT, cleanFileName, descendants, extensionOf, isUuid, maxFileBytes, trail, uniqueName, validFileRename, validFolderName, validStorageSubject, validateFile, typeOf, type StorageItem } from './storage-model.ts';

const bucket = 'subject-storage';
const setupError = 'Storage unavailable. Run supabase/storage.sql and check Supabase Storage.';

// ---- metadata (folders + files) -------------------------------------------------------------
interface Meta {
  list(subject: string): Promise<StorageItem[]>;
  insert(item: StorageItem): Promise<void>;
  rename(subject: string, id: string, name: string): Promise<void>;
  remove(subject: string, ids: string[]): Promise<void>;
  counts(): Promise<Record<string, number>>;
}

type Row = { id: string; subject: string; parent_id: string | null; kind: 'folder' | 'file'; name: string; size: number; created_at: string };
const fromRow = (r: Row): StorageItem => ({ id: r.id, subject: r.subject, parentId: r.parent_id, kind: r.kind, name: r.name, size: Number(r.size) || 0, createdAt: r.created_at });

const cloudMeta: Meta = {
  async list(subject) {
    const rows: Row[] = [];
    for (let offset = 0; ; offset += 500) {
      const page: Row[] = await supabaseRequest(`storage_items?select=*&subject=eq.${subject}&order=created_at.asc,id.asc&limit=500&offset=${offset}`);
      rows.push(...page);
      if (page.length < 500) return rows.map(fromRow);
    }
  },
  async insert(i) {
    await supabaseRequest('storage_items', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ id: i.id, subject: i.subject, parent_id: i.parentId, kind: i.kind, name: i.name, size: i.size, created_at: i.createdAt }) });
  },
  async rename(subject, id, name) {
    const rows: Row[] = await supabaseRequest(`storage_items?id=eq.${id}&subject=eq.${subject}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ name }) });
    if (!rows[0]) throw new InputError('That item no longer exists.');
  },
  async counts() {
    const out: Record<string, number> = {};
    for (let offset = 0; ; offset += 1000) {
      const page: { subject: string }[] = await supabaseRequest(`storage_items?select=subject&order=id.asc&limit=1000&offset=${offset}`);
      for (const r of page) out[r.subject] = (out[r.subject] || 0) + 1;
      if (page.length < 1000) return out;
    }
  },
  async remove(subject, ids) {
    for (let n = 0; n < ids.length; n += 50) await supabaseRequest(`storage_items?subject=eq.${subject}&id=in.(${ids.slice(n, n + 50).join(',')})`, { method: 'DELETE' });
  },
};

const localPath = () => process.env.DATABASE_PATH || resolve('data/renxzero.sqlite');
let sqlite: Meta | undefined;
async function localMeta(): Promise<Meta> {
  if (sqlite) return sqlite;
  const { DatabaseSync } = await import('node:sqlite'); // never loaded on Vercel
  const { mkdirSync } = await import('node:fs');
  mkdirSync(dirname(localPath()), { recursive: true });
  const db = new DatabaseSync(localPath());
  db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS storage_items (id TEXT PRIMARY KEY, subject TEXT NOT NULL, parent_id TEXT, kind TEXT NOT NULL, name TEXT NOT NULL, size INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL); CREATE INDEX IF NOT EXISTS storage_items_subject ON storage_items(subject);');
  sqlite = {
    list: async subject => (db.prepare('SELECT * FROM storage_items WHERE subject=? ORDER BY created_at, id').all(subject) as unknown as Row[]).map(fromRow),
    insert: async i => { db.prepare('INSERT INTO storage_items VALUES (?,?,?,?,?,?,?)').run(i.id, i.subject, i.parentId, i.kind, i.name, i.size, i.createdAt); },
    rename: async (subject, id, name) => { db.prepare('UPDATE storage_items SET name=? WHERE id=? AND subject=?').run(name, id, subject); },
    remove: async (subject, ids) => { for (const id of ids) db.prepare('DELETE FROM storage_items WHERE id=? AND subject=?').run(id, subject); },
    counts: async () => Object.fromEntries((db.prepare('SELECT subject, COUNT(*) AS n FROM storage_items GROUP BY subject').all() as unknown as { subject: string; n: number }[]).map(r => [r.subject, Number(r.n)])),
  };
  return sqlite;
}

// ---- file bytes -----------------------------------------------------------------------------
async function objects(path: string, init: RequestInit = {}) {
  const origin = new URL(process.env.SUPABASE_URL!);
  if (origin.protocol !== 'https:') throw Error('Invalid storage URL.');
  const key = process.env.SUPABASE_SECRET_KEY!;
  const response = await fetch(`${origin.origin}/storage/v1/${path}`, { ...init, cache: 'no-store', signal: AbortSignal.timeout(25000), headers: { apikey: key, ...(key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}), ...init.headers } });
  if (!response.ok) throw Error(setupError);
  return response;
}
const localFile = (subject: string, id: string) => resolve(dirname(localPath()), 'storage', subject, id);

async function putBytes(subject: string, id: string, mime: string, bytes: Uint8Array) {
  if (cloudConfigured()) await objects(`object/${bucket}/${subject}/${id}`, { method: 'POST', headers: { 'Content-Type': mime, 'x-upsert': 'false' }, body: new Blob([Buffer.from(bytes)], { type: mime }) });
  else { await mkdir(dirname(localFile(subject, id)), { recursive: true }); await writeFile(localFile(subject, id), bytes, { flag: 'wx' }); }
}
async function dropBytes(subject: string, ids: string[]) {
  if (!ids.length) return;
  if (cloudConfigured()) for (let n = 0; n < ids.length; n += 100) await objects(`object/${bucket}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: ids.slice(n, n + 100).map(id => `${subject}/${id}`) }) });
  else await Promise.all(ids.map(id => rm(localFile(subject, id), { force: true })));
}

// ---- public API (all inputs are validated here, not only in the route) -------------------------
async function meta(subject: string): Promise<Meta> {
  if (!validStorageSubject(subject)) throw new InputError('Invalid subject.');
  if (cloudConfigured()) return cloudMeta;
  if (cloudRequired()) throw Error('Storage is not configured.');
  return localMeta();
}
const parentFolder = (items: StorageItem[], parentId: string | null) => {
  if (parentId !== null && !isUuid(parentId)) throw new InputError('Invalid folder.');
  const path = trail(items, parentId);
  if (!path) throw new InputError('That folder no longer exists.');
  return path;
};

// How many folders/files each subject holds (used to stop a subject with content from being deleted).
export async function countItems(): Promise<Record<string, number>> {
  if (cloudConfigured()) return cloudMeta.counts();
  if (cloudRequired()) throw new Error('Storage is not configured.');
  return (await localMeta()).counts();
}

export async function listItems(subject: string) { return (await meta(subject)).list(subject); }

export async function createFolder(subject: string, parentId: string | null, rawName: unknown): Promise<StorageItem> {
  const db = await meta(subject), name = validFolderName(rawName), items = await db.list(subject);
  const path = parentFolder(items, parentId);
  if (path.length >= MAX_DEPTH) throw new InputError(`Folders can be nested up to ${MAX_DEPTH} levels deep.`);
  if (items.length >= MAX_ITEMS_PER_SUBJECT) throw new InputError('This subject has reached its storage item limit.');
  if (items.some(i => i.parentId === parentId && i.kind === 'folder' && i.name.toLowerCase() === name.toLowerCase())) throw new InputError('A folder with that name already exists here.');
  const item: StorageItem = { id: randomUUID(), subject, parentId, kind: 'folder', name, size: 0, createdAt: new Date().toISOString() };
  await db.insert(item);
  return item;
}

export async function uploadFile(subject: string, parentId: string | null, rawName: string, bytes: Uint8Array): Promise<StorageItem> {
  const db = await meta(subject), { name, mime } = validateFile(rawName, bytes), items = await db.list(subject);
  parentFolder(items, parentId);
  if (items.length >= MAX_ITEMS_PER_SUBJECT) throw new InputError('This subject has reached its storage item limit.');
  const item: StorageItem = { id: randomUUID(), subject, parentId, kind: 'file', name: uniqueName(name, items.filter(i => i.parentId === parentId && i.kind === 'file')), size: bytes.length, createdAt: new Date().toISOString() };
  await putBytes(subject, item.id, mime, bytes); // bytes first: a failed insert leaves an orphan, never a broken row
  try { await db.insert(item); } catch (e) { await dropBytes(subject, [item.id]).catch(() => {}); throw e; }
  return item;
}

export async function prepareFileUpload(subject: string, parentId: string | null, rawName: string, size: number) {
  const name = cleanFileName(rawName);
  if (!typeOf(name)) throw new InputError('This file type is not supported.');
  if (!Number.isSafeInteger(size) || size <= 0) throw new InputError('File is empty or has an invalid size.');
  if (size > maxFileBytes(name)) throw new InputError(extensionOf(name) === 'pdf' ? 'PDFs must be 50 MB or smaller.' : 'Files must be 4 MB or smaller.');
  if (extensionOf(name) !== 'pdf' || size <= MAX_FILE_BYTES || !cloudConfigured()) return null;

  const db = await meta(subject), items = await db.list(subject);
  parentFolder(items, parentId);
  if (items.length >= MAX_ITEMS_PER_SUBJECT) throw new InputError('This subject has reached its storage item limit.');
  const id = randomUUID();
  const origin = new URL(process.env.SUPABASE_URL!);
  const response = await objects(`object/upload/sign/${bucket}/${subject}/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  const data = await response.json() as { url?: string };
  if (typeof data.url !== 'string') throw Error('Could not prepare the PDF upload.');
  const signedUrl = new URL(`${origin.origin}/storage/v1${data.url.startsWith('/') ? data.url : '/' + data.url}`);
  if (signedUrl.origin !== origin.origin) throw Error('Could not prepare the PDF upload.');
  return { id, name: uniqueName(name, items.filter(i => i.parentId === parentId && i.kind === 'file')), signedUrl: signedUrl.toString() };
}

export async function completeFileUpload(subject: string, parentId: string | null, id: string, rawName: string, size: number): Promise<StorageItem> {
  if (!isUuid(id)) throw new InputError('Invalid file.');
  const name = cleanFileName(rawName);
  if (extensionOf(name) !== 'pdf' || !Number.isSafeInteger(size) || size <= MAX_FILE_BYTES || size > MAX_PDF_BYTES) throw new InputError('Invalid PDF upload.');
  const db = await meta(subject), items = await db.list(subject);
  parentFolder(items, parentId);
  if (items.some(i => i.id === id)) throw new InputError('This file has already been uploaded.');
  if (items.length >= MAX_ITEMS_PER_SUBJECT) throw new InputError('This subject has reached its storage item limit.');

  const response = await objects(`object/${bucket}/${subject}/${id}`, { headers: { Range: 'bytes=0-4' } });
  const reader = response.body?.getReader();
  if (!reader) throw new InputError('The uploaded PDF could not be verified.');
  const { value } = await reader.read();
  await reader.cancel();
  if (!value || value.length < 5 || new TextDecoder().decode(value.slice(0, 5)) !== '%PDF-') {
    await dropBytes(subject, [id]);
    throw new InputError('This file is not a valid PDF.');
  }
  const range = response.headers.get('content-range');
  const actualSize = range && Number(range.slice(range.lastIndexOf('/') + 1));
  if (!actualSize || actualSize !== size) {
    await dropBytes(subject, [id]);
    throw new InputError('The uploaded PDF size could not be verified.');
  }

  const item: StorageItem = { id, subject, parentId, kind: 'file', name: uniqueName(name, items.filter(i => i.parentId === parentId && i.kind === 'file')), size, createdAt: new Date().toISOString() };
  try { await db.insert(item); } catch (e) { await dropBytes(subject, [id]).catch(() => {}); throw e; }
  return item;
}

export async function signedFileDownload(subject: string, id: string, name: string) {
  if (!validStorageSubject(subject) || !isUuid(id)) throw new InputError('Invalid file.');
  const origin = new URL(process.env.SUPABASE_URL!);
  const response = await objects(`object/sign/${bucket}/${subject}/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresIn: 60 }) });
  const data = await response.json() as { signedURL?: string };
  if (typeof data.signedURL !== 'string') throw Error('Could not prepare the file download.');
  const signedUrl = new URL(`${origin.origin}/storage/v1${data.signedURL.startsWith('/') ? data.signedURL : '/' + data.signedURL}`);
  if (signedUrl.origin !== origin.origin) throw Error('Could not prepare the file download.');
  signedUrl.searchParams.set('download', name);
  return signedUrl.toString();
}

export async function renameItem(subject: string, id: string, rawName: unknown): Promise<void> {
  if (!isUuid(id)) throw new InputError('Invalid item.');
  const db = await meta(subject), items = await db.list(subject), item = items.find(i => i.id === id);
  if (!item) throw new InputError('That item no longer exists.');
  const name = item.kind === 'folder' ? validFolderName(rawName) : validFileRename(item.name, rawName);
  if (items.some(i => i.id !== id && i.parentId === item.parentId && i.kind === item.kind && i.name.toLowerCase() === name.toLowerCase())) throw new InputError('An item with that name already exists here.');
  await db.rename(subject, id, name);
}
export async function deleteItem(subject: string, id: string): Promise<void> {
  if (!isUuid(id)) throw new InputError('Invalid item.');
  const db = await meta(subject), items = await db.list(subject), item = items.find(i => i.id === id);
  if (!item) throw new InputError('That item no longer exists.');
  const all = [item, ...descendants(items, id)];
  await db.remove(subject, all.map(i => i.id)); // rows first: leftover bytes are harmless, dangling rows are not
  await dropBytes(subject, all.filter(i => i.kind === 'file').map(i => i.id)).catch(() => {});
}

export async function readFileItem(subject: string, id: string): Promise<{ item: StorageItem; bytes: Uint8Array; mime: string }> {
  if (!isUuid(id)) throw new InputError('Invalid item.');
  const db = await meta(subject), item = (await db.list(subject)).find(i => i.id === id && i.kind === 'file');
  if (!item) throw Object.assign(new InputError('File not found.'), { code: 'ENOENT' });
  const bytes = cloudConfigured() ? new Uint8Array(await (await objects(`object/${bucket}/${subject}/${id}`)).arrayBuffer()) : new Uint8Array(await readFile(localFile(subject, id)));
  return { item, bytes, mime: typeOf(item.name)?.mime || 'application/octet-stream' };
}
