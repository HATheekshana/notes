-- Run once in Supabase SQL Editor to turn on "Courses & subjects" management. Safe to rerun.
-- Your existing notes, PDFs and files are not changed. The five subjects you already have are saved as
-- Computer Science → Year 1 · Semester 2, and from then on you manage everything inside the app.
begin;

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

-- Notes and files used to accept only the five original subject codes. Replace that fixed list with a
-- format rule so any subject you create in the app is accepted (the app checks the subject exists).
do $$
declare r record;
begin
  for r in
    select c.conrelid::regclass as tbl, c.conname
    from pg_constraint c
    where c.contype = 'c'
      and c.conrelid in (to_regclass('public.notes'), to_regclass('public.storage_items'))
      and pg_get_constraintdef(c.oid) ilike '%subject%'
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
  if to_regclass('public.notes') is not null then
    alter table public.notes add constraint notes_subject_format check (subject ~ '^[A-Z0-9][A-Z0-9_-]{1,11}$');
  end if;
  if to_regclass('public.storage_items') is not null then
    alter table public.storage_items add constraint storage_items_subject_format check (subject ~ '^[A-Z0-9][A-Z0-9_-]{1,11}$');
  end if;
end $$;

commit;
