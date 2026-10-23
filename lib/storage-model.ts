// Pure helpers for the per-subject Storage section (folders + files).
// No I/O here so the rules can be unit tested and shared with the browser.
export const MAX_FILE_BYTES = 4 * 1024 * 1024; // keeps uploads inside Vercel's request body limit
export const MAX_DEPTH = 6; // folders nested deeper than this are rejected
export const MAX_ITEMS_PER_SUBJECT = 1000;

// Safe-to-show validation failures. Anything else is treated as an infrastructure error by the API.
export class InputError extends Error { code?: string; }

export type StorageItem = {
  id: string;
  subject: string;
  parentId: string | null;
  kind: 'folder' | 'file';
  name: string;
  size: number;
  createdAt: string;
};

export const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export const isUuid = (v: unknown): v is string => typeof v === 'string' && uuidPattern.test(v);
export const validStorageSubject = (s: string) => ['FOA', 'OS', 'IWT', 'DBMS', 'OOP'].includes(s);

// Allowed types. The extension decides the Content-Type we serve, never the browser-supplied one.
// SVG/HTML are deliberately absent: they can run script when opened.
type FileType = { mime: string; inline: boolean; sig?: number[][]; text?: boolean };
const zip = [[0x50, 0x4b, 0x03, 0x04], [0x50, 0x4b, 0x05, 0x06]];
const ole = [[0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]];
export const fileTypes: Record<string, FileType> = {
  pdf: { mime: 'application/pdf', inline: true, sig: [[0x25, 0x50, 0x44, 0x46, 0x2d]] },
  png: { mime: 'image/png', inline: true, sig: [[0x89, 0x50, 0x4e, 0x47]] },
  jpg: { mime: 'image/jpeg', inline: true, sig: [[0xff, 0xd8, 0xff]] },
  jpeg: { mime: 'image/jpeg', inline: true, sig: [[0xff, 0xd8, 0xff]] },
  gif: { mime: 'image/gif', inline: true, sig: [[0x47, 0x49, 0x46, 0x38]] },
  webp: { mime: 'image/webp', inline: true, sig: [[0x52, 0x49, 0x46, 0x46]] },
  txt: { mime: 'text/plain', inline: false, text: true },
  md: { mime: 'text/plain', inline: false, text: true },
  csv: { mime: 'text/csv', inline: false, text: true },
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', inline: false, sig: zip },
  pptx: { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', inline: false, sig: zip },
  xlsx: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', inline: false, sig: zip },
  zip: { mime: 'application/zip', inline: false, sig: zip },
  doc: { mime: 'application/msword', inline: false, sig: ole },
  ppt: { mime: 'application/vnd.ms-powerpoint', inline: false, sig: ole },
  xls: { mime: 'application/vnd.ms-excel', inline: false, sig: ole },
};
export const allowedMimeTypes = [...new Set(Object.values(fileTypes).map(t => t.mime))];
export const acceptAttribute = Object.keys(fileTypes).map(e => '.' + e).join(',');
export const extensionOf = (name: string) => (/\.([A-Za-z0-9]{1,5})$/.exec(name)?.[1] || '').toLowerCase();
export const typeOf = (name: string): FileType | undefined => fileTypes[extensionOf(name)];

const control = /[\u0000-\u001f\u007f]/;
const forbidden = /[\\/:*?"<>|]/; // no /g: .test() on a global regex is stateful
const forbiddenAll = new RegExp(forbidden.source, 'g');

export function validFolderName(input: unknown): string {
  if (typeof input !== 'string') throw new InputError('Enter a folder name.');
  const name = input.normalize('NFC').trim().replace(/\s+/g, ' ');
  if (!name) throw new InputError('Enter a folder name.');
  if (name.length > 80) throw new InputError('Folder names must be 80 characters or fewer.');
  if (control.test(name) || forbidden.test(name) || name === '.' || name === '..') throw new InputError('Folder names cannot contain / \\ : * ? " < > | or be "." / "..".');
  return name;
}

export function cleanFileName(input: string): string {
  const base = input.normalize('NFC').split(/[\\/]/).pop() || '';
  const ext = extensionOf(base);
  const stem = base.slice(0, base.length - (ext ? ext.length + 1 : 0)).replace(control, '').replace(forbiddenAll, '_').replace(/\s+/g, ' ').trim().replace(/^\.+/, '').slice(0, 120);
  return (stem || 'file') + (ext ? '.' + ext : '');
}

// Renaming never changes the file type: the original extension is kept (or appended).
export function validFileRename(oldName: string, input: unknown): string {
  if (typeof input !== 'string' || !input.trim()) throw new InputError('Enter a file name.');
  const ext = extensionOf(oldName);
  let next = cleanFileName(input);
  if (ext && extensionOf(next) !== ext) next = cleanFileName(next + '.' + ext);
  return next;
}

export function validateFile(name: string, bytes: Uint8Array): { name: string; mime: string } {
  const clean = cleanFileName(name);
  const type = typeOf(clean);
  if (!type) throw new InputError('This file type is not supported. Allowed: PDF, images, Office files, text, CSV and ZIP.');
  if (!bytes.length) throw new InputError('This file is empty.');
  if (bytes.length > MAX_FILE_BYTES) throw new InputError('Files must be 4 MB or smaller.');
  if (type.sig && !type.sig.some(s => s.every((b, i) => bytes[i] === b))) throw new InputError('This file does not match its extension.');
  if (type.text && bytes.subarray(0, 4096).includes(0)) throw new InputError('This file does not look like text.');
  return { name: clean, mime: type.mime };
}

export const children = (items: StorageItem[], parentId: string | null) =>
  items.filter(i => i.parentId === parentId).sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }) : a.kind === 'folder' ? -1 : 1));

export function descendants(items: StorageItem[], id: string): StorageItem[] {
  const out: StorageItem[] = [];
  const stack = [id];
  const seen = new Set<string>();
  while (stack.length) {
    const current = stack.pop()!;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const item of items) if (item.parentId === current) { out.push(item); stack.push(item.id); }
  }
  return out;
}

// Path from the root to the given folder, e.g. [Week 1, Slides]. Null if the id does not exist.
export function trail(items: StorageItem[], folderId: string | null): StorageItem[] | null {
  const path: StorageItem[] = [];
  let current = folderId;
  while (current) {
    const folder = items.find(i => i.id === current && i.kind === 'folder');
    if (!folder || path.length > MAX_DEPTH + 1) return null;
    path.unshift(folder);
    current = folder.parentId;
  }
  return path;
}

export function uniqueName(name: string, siblings: StorageItem[]): string {
  const taken = new Set(siblings.map(s => s.name.toLowerCase()));
  if (!taken.has(name.toLowerCase())) return name;
  const ext = extensionOf(name);
  const stem = ext ? name.slice(0, -(ext.length + 1)) : name;
  for (let n = 2; ; n++) {
    const candidate = `${stem} (${n})${ext ? '.' + ext : ''}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

export const formatSize = (bytes: number) => bytes < 1024 ? bytes + ' B' : bytes < 1048576 ? (bytes / 1024).toFixed(0) + ' KB' : (bytes / 1048576).toFixed(2) + ' MB';
