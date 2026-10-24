import { DEFAULT_COURSES } from './curriculum-model.ts';
// The built-in subjects (used until the administrator saves their own curriculum). The live list comes from /api/curriculum.
export const subjects = DEFAULT_COURSES.flatMap(c => c.semesters.flatMap(s => s.subjects));
export type Note = { id: string; subject: string; title: string; content: string; tags: string[]; published: boolean; updatedAt: string };
export function validateNote(input: unknown, validSubjects: readonly string[] = subjects.map(s => s.id)): Omit<Note,'id'|'updatedAt'> {
  if (!input || typeof input !== 'object') throw new Error('Note is required.');
  const v = input as Record<string,unknown>;
  if (typeof v.subject !== 'string' || !validSubjects.includes(v.subject)) throw new Error('Choose a valid subject.');
  if (typeof v.title !== 'string' || !v.title.trim() || v.title.length>160) throw new Error('Title must be 1–160 characters.');
  if (typeof v.content !== 'string' || !v.content.trim() || v.content.length>100000) throw new Error('Notes must be 1–100,000 characters.');
  if (!Array.isArray(v.tags) || v.tags.length>12 || v.tags.some(t=>typeof t!=='string'||t.length>40)) throw new Error('Use up to 12 tags, each under 40 characters.');
  if (typeof v.published !== 'boolean') throw new Error('Choose draft or published.');
  return {subject:v.subject as string,title:v.title.trim(),content:v.content,tags:[...new Set(v.tags.map(t=>t.trim()).filter(Boolean))],published:v.published};
}
