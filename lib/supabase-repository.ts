import { randomUUID } from 'node:crypto';
import type { Note } from './model';
import type { NotesRepository } from './repository';
export const cloudConfigured = () => !!(process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);
export const cloudRequired = () => !!(process.env.VERCEL || process.env.SUPABASE_URL || process.env.SUPABASE_SECRET_KEY);

// Server-route imports only. Never use NEXT_PUBLIC_ for the secret key.
export async function supabaseRequest(path: string, init: RequestInit = {}) {
  if (!cloudConfigured()) throw new Error('Supabase is not configured.');
  const base = new URL(process.env.SUPABASE_URL!);
  if (base.protocol !== 'https:' || base.username || base.password) throw new Error('SUPABASE_URL must be an HTTPS project URL.');
  const key = process.env.SUPABASE_SECRET_KEY!;
  const response = await fetch(`${base.origin}/rest/v1/${path}`, {
    ...init, cache: 'no-store', signal: AbortSignal.timeout(15000),
    headers: { apikey: key, ...(key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}), 'Content-Type': 'application/json', ...init.headers },
  });
  if (!response.ok) throw new Error('Database unavailable. Check Supabase settings and run supabase/setup.sql.');
  return response.status === 204 ? null : response.json();
}
type Row = Omit<Note, 'updatedAt'> & { updated_at: string };
const decode = ({ updated_at, ...row }: Row): Note => ({ ...row, updatedAt: updated_at });
export function createSupabaseRepository(): NotesRepository {
  return {
    async list(includeDrafts = false) {
      const rows: Row[] = [];
      for (let offset = 0; ; offset += 500) {
        const page: Row[] = await supabaseRequest(`notes?select=*&order=updated_at.desc,id.asc&limit=500&offset=${offset}${includeDrafts ? '' : '&published=eq.true'}`);
        rows.push(...page);
        if (page.length < 500) break;
      }
      return rows.map(decode);
    },
    async save(note, id) {
      const body = { ...note, updated_at: new Date().toISOString(), ...(!id ? { id: randomUUID() } : {}) };
      const rows: Row[] = await supabaseRequest(id ? `notes?id=eq.${encodeURIComponent(id)}` : 'notes', {
        method: id ? 'PATCH' : 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(body),
      });
      if (!rows[0]) throw new Error('This note no longer exists. Refresh and try again.');
      return decode(rows[0]);
    },
    async delete(id) {
      const rows: Row[] = await supabaseRequest(`notes?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE', headers: { Prefer: 'return=representation' } });
      return rows.length > 0;
    },
  };
}
let localAttempts = { time: 0, count: 0 };
export async function allowLoginAttempt(): Promise<boolean> {
  if (cloudConfigured()) return (await supabaseRequest('rpc/consume_login_attempt', { method: 'POST', body: '{}' })) === true;
  if (cloudRequired()) throw new Error('Supabase is not configured.');
  if (Date.now() - localAttempts.time > 60000) localAttempts = { time: Date.now(), count: 0 };
  return ++localAttempts.count <= 10;
}
