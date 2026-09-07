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
