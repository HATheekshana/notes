-- Run setup.sql (this schema plus the first lesson) in Supabase SQL Editor.
begin;
create table if not exists public.notes (
  id text primary key,
  subject text not null check (subject in ('FOA','OS','IWT','DBMS','OOP')),
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
commit;

-- Seed once. Rerunning setup never overwrites edits or restores a deleted lesson.
begin;
with first_run as (
  insert into public.renxzero_metadata (key,value) values ('seeded','true')
  on conflict do nothing returning key
)
insert into public.notes (id,subject,title,content,tags,published)
select 'introduction-to-algorithms','FOA','Introduction to Algorithms',
'## What is an algorithm?

An **algorithm** is a finite sequence of well-defined steps used to solve a problem.

For example, the problem might be to find a particular value in a list. The algorithm is the specific method we use to find it.

## Problem vs instance

| Concept | Meaning | Example |
| --- | --- | --- |
| Problem | A general task or question | Find a value in a list |
| Instance | One particular input | Find 8 in [5, 2, 8] |

> **Remember:** problem = general question; instance = actual input.

## Input size

Input size describes how much data an algorithm processes. For a list, we often use the number of elements, $n$.

~~~python
numbers = [5, 2, 8]
n = len(numbers)  # n = 3
~~~

The meaning of $n$ depends on the problem: it could be elements, characters, or vertices in a graph.

## Time vs space complexity

**Time complexity** describes how the amount of work grows as the input size $n$ increases.

**Space complexity** describes how memory use grows. **Auxiliary space** specifically measures additional memory beyond the input.

## Big-O: upper bound

We write $f(n)=O(g(n))$ if there exist constants $c>0$ and $n_0\geq 0$ such that, for every $n\geq n_0$:

$$
0\leq f(n)\leq c\,g(n)
$$

Big-O gives an asymptotic upper bound. For example, $3n+2=O(n)$ because $3n+2\leq 5n$ for $n\geq 1$.

## Big-Omega: lower bound

We write $f(n)=\Omega(g(n))$ if there exist constants $c>0$ and $n_0\geq 0$ such that, for every $n\geq n_0$:

$$
0\leq c\,g(n)\leq f(n)
$$

Omega gives an asymptotic lower bound.

## Big-Theta: tight bound

We write $f(n)=\Theta(g(n))$ when $g(n)$ is both an upper and a lower asymptotic bound. There exist positive constants $c_1,c_2$ and a threshold $n_0$ such that, for all $n\geq n_0$:

$$
0\leq c_1g(n)\leq f(n)\leq c_2g(n)
$$

Thus $3n+2=\Theta(n)$. These bounds describe growth; Big-O does not inherently mean worst case, and Omega does not inherently mean best case.

## Growth order

From slowest to fastest asymptotic growth:

$$
1 < \log n < n < n\log n < n^2 < n^3 < 2^n < n!
$$

This is a comparison for sufficiently large $n$, not a strict inequality at every small input. The logarithm has any fixed base greater than 1.
','["foundations","complexity","big-o"]'::jsonb ,true from first_run
on conflict (id) do nothing;
commit;
