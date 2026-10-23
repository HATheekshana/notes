-- Run once in Supabase SQL Editor for the Storage section (folders + files). Safe to rerun.
-- Existing notes, PDF resources and files are left unchanged.
begin;
create table if not exists public.storage_items (
  id uuid primary key,
  subject text not null check (subject in ('FOA','OS','IWT','DBMS','OOP')),
  parent_id uuid references public.storage_items(id) on delete cascade,
  kind text not null check (kind in ('folder','file')),
  name text not null check (length(name) between 1 and 140),
  size bigint not null default 0 check (size >= 0),
  created_at timestamptz not null default now()
);
create index if not exists storage_items_subject_parent on public.storage_items(subject, parent_id);
alter table public.storage_items enable row level security;
-- No direct browser access. Only the app server's secret key can read or write this table.
revoke all on public.storage_items from anon, authenticated;
grant all on public.storage_items to service_role;
commit;

-- Private bucket; the website controls access through its server API.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('subject-storage', 'subject-storage', false, 4194304, array[
  'application/pdf','image/png','image/jpeg','image/gif','image/webp',
  'text/plain','text/csv','application/zip','application/msword','application/vnd.ms-powerpoint','application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do update set public = false, file_size_limit = 4194304, allowed_mime_types = excluded.allowed_mime_types;
-- Keep this bucket private and do not add anon/authenticated policies.
