import type { Note } from './model';
import { cloudConfigured, cloudRequired, createSupabaseRepository } from './supabase-repository';
export interface NotesRepository {
  list(includeDrafts?: boolean): Promise<Note[]>;
  save(note: Omit<Note, 'id' | 'updatedAt'>, id?: string): Promise<Note>;
  delete(id: string): Promise<boolean>;
}
// Never open a filesystem database on Vercel, even when configuration is missing.
export async function repository(): Promise<NotesRepository> {
  if (cloudConfigured()) return createSupabaseRepository();
  if (cloudRequired()) throw new Error('Configure SUPABASE_URL and SUPABASE_SECRET_KEY, then run supabase/setup.sql.');
  const { repository: local } = await import('./sqlite-repository');
  const db = local();
  return {
    list: async (includeDrafts = false) => db.list().filter(n => includeDrafts || n.published),
    save: async (note, id) => db.save(note, id),
    delete: async id => db.delete(id),
  };
}
