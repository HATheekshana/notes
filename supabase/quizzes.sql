begin;
create table if not exists public.quizzes (
  id uuid primary key,
  subject text not null check (subject ~ '^[A-Z0-9][A-Z0-9_-]{1,11}$'),
  title text not null check (length(title) between 1 and 160),
  data jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists quizzes_subject_created on public.quizzes(subject, created_at desc);
alter table public.quizzes enable row level security;
revoke all on public.quizzes from anon, authenticated;
grant all on public.quizzes to service_role;
commit;
