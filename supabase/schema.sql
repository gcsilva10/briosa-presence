-- Run in Supabase SQL Editor. No public write access; each user owns their rows.
create table if not exists public.attendances (
  user_id uuid not null references auth.users(id) on delete cascade,
  match_id text not null,
  attended_at timestamptz not null default now(),
  primary key (user_id, match_id)
);
alter table public.attendances enable row level security;
revoke all on public.attendances from anon;
grant select, insert, delete on public.attendances to authenticated;
drop policy if exists "read own attendances" on public.attendances;
create policy "read own attendances" on public.attendances for select to authenticated using (auth.uid() = user_id);
drop policy if exists "insert own attendances" on public.attendances;
create policy "insert own attendances" on public.attendances for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "delete own attendances" on public.attendances;
create policy "delete own attendances" on public.attendances for delete to authenticated using (auth.uid() = user_id);
