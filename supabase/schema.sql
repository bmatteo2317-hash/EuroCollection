-- Collezione privata: una riga per (utente, moneta).
-- coin_id = ID stabile del catalogo statico (lib/catalog.ts),
-- es. "it-2004-2euro-commemorative-0".
-- Esegui nel SQL Editor di Supabase.

create table if not exists public.user_collection (
  user_id uuid not null references auth.users (id) on delete cascade,
  coin_id text not null,
  quantity integer not null default 1 check (quantity > 0),
  -- Stato di conservazione (NULL = non specificato) e note libere.
  grade text check (grade is null or grade in ('FDC', 'SPL', 'BB', 'MB', 'B')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, coin_id)
);

alter table public.user_collection enable row level security;

drop policy if exists "own rows select" on public.user_collection;
create policy "own rows select" on public.user_collection
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "own rows insert" on public.user_collection;
create policy "own rows insert" on public.user_collection
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "own rows update" on public.user_collection;
create policy "own rows update" on public.user_collection
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "own rows delete" on public.user_collection;
create policy "own rows delete" on public.user_collection
  for delete to authenticated using (auth.uid() = user_id);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_touch_updated_at on public.user_collection;
create trigger trg_touch_updated_at
  before update on public.user_collection
  for each row execute function public.touch_updated_at();

create index if not exists idx_user_collection_user
  on public.user_collection (user_id);

-- Possesso per singolo anno (collezione "tutti gli anni"): una riga per
-- anno posseduto di un disegno. Vedi migration_003_collection_years.sql
-- + migration_004_year_details.sql.
--
-- coin_id = ID disegno del catalogo (l'anno dentro è l'anno del DISEGNO,
-- es. "it-2002-2euro-regular-0"); `year` = anno REALE posseduto.
-- quantity = doppioni di quell'anno (1 = posseduto, 2+ = doppioni).
-- La riga principale in user_collection.quantity è la SOMMA dei pezzi
-- di tutti gli anni del disegno (sincronizzata dal server).
create table if not exists public.user_collection_years (
  user_id uuid not null references auth.users (id) on delete cascade,
  coin_id text not null,
  year integer not null check (year between 1999 and 2100),
  quantity integer not null default 1 check (quantity > 0),
  grade text check (grade is null or grade in ('FDC', 'SPL', 'BB', 'MB', 'B')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
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

create index if not exists idx_user_collection_years_coin
  on public.user_collection_years (user_id, coin_id);

drop trigger if exists trg_touch_years_updated_at on public.user_collection_years;
create trigger trg_touch_years_updated_at
  before update on public.user_collection_years
  for each row execute function public.touch_updated_at();
