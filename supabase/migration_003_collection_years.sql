-- Migrazione 003: possesso per singolo anno (collezione "tutti gli anni").
-- Esegui nel SQL Editor di Supabase.
--
-- Ogni riga = un anno posseduto di un disegno (coin_id come in user_collection).
-- La quantità sulla riga principale (user_collection) resta sincronizzata
-- dal server = numero di anni posseduti del disegno.

create table if not exists public.user_collection_years (
  user_id uuid not null references auth.users (id) on delete cascade,
  coin_id text not null,
  year integer not null check (year between 1999 and 2100),
  quantity integer not null default 1 check (quantity > 0),
  created_at timestamptz not null default now(),
  primary key (user_id, coin_id, year)
);

alter table public.user_collection_years enable row level security;

drop policy if exists "own years select" on public.user_collection_years;
create policy "own years select" on public.user_collection_years
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "own years insert" on public.user_collection_years;
create policy "own years insert" on public.user_collection_years
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "own years update" on public.user_collection_years;
create policy "own years update" on public.user_collection_years
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "own years delete" on public.user_collection_years;
create policy "own years delete" on public.user_collection_years
  for delete to authenticated using (auth.uid() = user_id);

create index if not exists idx_user_collection_years_user
  on public.user_collection_years (user_id);
