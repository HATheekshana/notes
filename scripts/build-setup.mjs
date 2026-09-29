// Keep the local and cloud seed lesson identical. No credentials required.
import { readFileSync, writeFileSync } from 'node:fs';
import { seedContent } from '../lib/seed.ts';
const quote = value => "'" + value.replaceAll("'", "''") + "'";
const seed = `
-- Seed once. Rerunning setup never overwrites edits or restores a deleted lesson.
begin;
with first_run as (
  insert into public.renxzero_metadata (key,value) values ('seeded','true')
  on conflict do nothing returning key
)
insert into public.notes (id,subject,title,content,tags,published)
select 'introduction-to-algorithms','FOA','Introduction to Algorithms',
${quote(seedContent)},'[' || ']' ,true from first_run
on conflict (id) do nothing;
commit;
`;
writeFileSync(new URL('../supabase/setup.sql', import.meta.url), readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8') + seed.replace("'[' || ']'", `'["foundations","complexity","big-o"]'::jsonb`));
console.log('Generated supabase/setup.sql');
