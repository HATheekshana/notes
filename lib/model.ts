export const subjects = [
  { id: 'FOA', name: 'Fundamentals of Algorithms', description: 'Think clearly. Solve efficiently.', icon: 'Braces', color: '#7367eb' },
  { id: 'OS', name: 'Operating Systems', description: 'Understand what runs underneath.', icon: 'Cpu', color: '#269e8a' },
  { id: 'IWT', name: 'Internet & Web Technologies', description: 'Build for a connected world.', icon: 'Globe', color: '#d48a32' },
  { id: 'DBMS', name: 'Database Management Systems', description: 'Give your data a structure.', icon: 'Database', color: '#3a8edb' },
  { id: 'OOP', name: 'Object-Oriented Programming', description: 'Model ideas through objects.', icon: 'Boxes', color: '#cd6499' },
] as const;
export type Note = { id: string; subject: string; title: string; content: string; tags: string[]; published: boolean; updatedAt: string };
export function validateNote(input: unknown): Omit<Note,'id'|'updatedAt'> {
  if (!input || typeof input !== 'object') throw new Error('Note is required.');
  const v = input as Record<string,unknown>;
  if (!subjects.some(s=>s.id===v.subject)) throw new Error('Choose a valid subject.');
  if (typeof v.title !== 'string' || !v.title.trim() || v.title.length>160) throw new Error('Title must be 1–160 characters.');
  if (typeof v.content !== 'string' || !v.content.trim() || v.content.length>100000) throw new Error('Notes must be 1–100,000 characters.');
  if (!Array.isArray(v.tags) || v.tags.length>12 || v.tags.some(t=>typeof t!=='string'||t.length>40)) throw new Error('Use up to 12 tags, each under 40 characters.');
  if (typeof v.published !== 'boolean') throw new Error('Choose draft or published.');
  return {subject:v.subject as string,title:v.title.trim(),content:v.content,tags:[...new Set(v.tags.map(t=>t.trim()).filter(Boolean))],published:v.published};
}
