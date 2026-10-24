-- Run setup.sql (this schema plus the first lesson) in Supabase SQL Editor.
begin;
create table if not exists public.notes (
  id text primary key,
  subject text not null check (subject ~ '^[A-Z0-9][A-Z0-9_-]{1,11}$'),
  title text not null check (length(title) between 1 and 160),
  content text not null check (length(content) between 1 and 100000),
  tags jsonb not null default '[]'::jsonb check (jsonb_typeof(tags)='array'),
  published boolean not null default false,
  updated_at timestamptz not null default now()
);
create index if not exists notes_published_updated on public.notes(published, updated_at desc);
create table if not exists public.renxzero_metadata (key text primary key, value text not null);
create table if not exists public.renxzero_login_limit (
  id integer primary key check(id=1),
  window_start timestamptz not null,
  attempts integer not null
);
alter table public.notes enable row level security;
alter table public.renxzero_metadata enable row level security;
alter table public.renxzero_login_limit enable row level security;
-- No direct browser access. Only the app server's secret key can access these tables.
revoke all on public.notes, public.renxzero_metadata, public.renxzero_login_limit from anon, authenticated;
grant all on public.notes, public.renxzero_metadata, public.renxzero_login_limit to service_role;

create or replace function public.consume_login_attempt() returns boolean
language plpgsql security invoker set search_path = '' as $$
declare attempt_count integer;
begin
  insert into public.renxzero_login_limit as limits (id, window_start, attempts)
  values (1, now(), 1)
  on conflict (id) do update set
    window_start = case when limits.window_start <= now()-interval '1 minute' then now() else limits.window_start end,
    attempts = case when limits.window_start <= now()-interval '1 minute' then 1 else least(limits.attempts+1, 11) end
  returning attempts into attempt_count;
  return attempt_count <= 10;
end;
$$;
revoke all on function public.consume_login_attempt() from public, anon, authenticated;
grant execute on function public.consume_login_attempt() to service_role;
-- Courses, semesters and subjects (managed in the app). Starts with your original five subjects.
create table if not exists public.curriculum (
  id int primary key default 1 check (id = 1),     -- exactly one row
  data jsonb not null,                              -- courses -> semesters -> subjects
  version int not null default 1,                   -- bumped on every save (prevents overwriting a newer edit)
  updated_at timestamptz not null default now()
);
alter table public.curriculum enable row level security;
-- No direct browser access. Only the app server's secret key can read or write this table.
revoke all on public.curriculum from anon, authenticated;
grant all on public.curriculum to service_role;

-- Starting structure: the five subjects you already have. Only inserted if the table is empty.
insert into public.curriculum (id, data) values (1, $json$[{"id":"CS","name":"Computer Science","semesters":[{"id":"y1s2","name":"Year 1 · Semester 2","subjects":[{"id":"FOA","name":"Fundamentals of Algorithms","description":"Think clearly. Solve efficiently.","icon":"Braces","color":"#7367eb"},{"id":"OS","name":"Operating Systems","description":"Understand what runs underneath.","icon":"Cpu","color":"#269e8a"},{"id":"IWT","name":"Internet & Web Technologies","description":"Build for a connected world.","icon":"Globe","color":"#d48a32"},{"id":"DBMS","name":"Database Management Systems","description":"Give your data a structure.","icon":"Database","color":"#3a8edb"},{"id":"OOP","name":"Object-Oriented Programming","description":"Model ideas through objects.","icon":"Boxes","color":"#cd6499"}]}]}]$json$::jsonb)
on conflict (id) do nothing;
commit;
