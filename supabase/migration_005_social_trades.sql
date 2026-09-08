-- Migrazione 005: amicizie + scambi.
-- Esegui nel SQL Editor di Supabase.
--
-- profiles:      nome pubblico di ogni utente (serve per trovarsi tra
--                collezionisti: auth.users non è leggibile dagli altri).
-- friendships:   richieste di amicizia (pending) e amicizie (accepted).
-- trade_offers:  monete messe a disposizione per gli scambi, visibili ai
--                soli amici (oltre che al proprietario).

-- Profili pubblici ------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles readable" on public.profiles;
create policy "profiles readable" on public.profiles
  for select to authenticated using (true);

drop policy if exists "own profile insert" on public.profiles;
create policy "own profile insert" on public.profiles
  for insert to authenticated with check (auth.uid() = id);

drop policy if exists "own profile update" on public.profiles;
create policy "own profile update" on public.profiles
  for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Profilo automatico alla registrazione (nome = parte prima della @).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, split_part(coalesce(new.email, 'collezionista'), '@', 1))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Profili per gli utenti già registrati (una tantum, sicura da rieseguire).
insert into public.profiles (id, display_name)
select u.id, split_part(coalesce(u.email, 'collezionista'), '@', 1)
from auth.users u
on conflict (id) do nothing;

-- Amicizie ---------------------------------------------------------------
create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users (id) on delete cascade,
  addressee_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (requester_id <> addressee_id),
  unique (requester_id, addressee_id)
);

alter table public.friendships enable row level security;

drop policy if exists "own friendships select" on public.friendships;
create policy "own friendships select" on public.friendships
  for select to authenticated
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

drop policy if exists "own friendships insert" on public.friendships;
create policy "own friendships insert" on public.friendships
  for insert to authenticated with check (auth.uid() = requester_id);

drop policy if exists "own friendships update" on public.friendships;
create policy "own friendships update" on public.friendships
  for update to authenticated
  using (auth.uid() = requester_id or auth.uid() = addressee_id)
  with check (auth.uid() = requester_id or auth.uid() = addressee_id);

drop policy if exists "own friendships delete" on public.friendships;
create policy "own friendships delete" on public.friendships
  for delete to authenticated
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

drop trigger if exists trg_touch_friendships_updated_at on public.friendships;
create trigger trg_touch_friendships_updated_at
  before update on public.friendships
  for each row execute function public.touch_updated_at();

-- "Sono amici?" (bypass RLS: usata dalla policy di lettura offerte).
create or replace function public.is_friend(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.friendships
    where status = 'accepted'
      and ((requester_id = a and addressee_id = b)
        or (requester_id = b and addressee_id = a))
  );
$$;

-- Offerte di scambio ------------------------------------------------------
create table if not exists public.trade_offers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  coin_id text not null,
  year integer check (year is null or (year between 1999 and 2100)),
  quantity integer not null default 1 check (quantity > 0),
  grade text check (grade is null or grade in ('FDC', 'SPL', 'BB', 'MB', 'B')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Un'offerta per (utente, moneta, anno): NULL anno = generica sul disegno.
create unique index if not exists uq_trade_offers_user_coin_year
  on public.trade_offers (user_id, coin_id, coalesce(year, -1));

alter table public.trade_offers enable row level security;

drop policy if exists "offers readable by owner and friends" on public.trade_offers;
create policy "offers readable by owner and friends" on public.trade_offers
  for select to authenticated
  using (auth.uid() = user_id or public.is_friend(auth.uid(), user_id));

drop policy if exists "own offers insert" on public.trade_offers;
create policy "own offers insert" on public.trade_offers
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "own offers update" on public.trade_offers;
create policy "own offers update" on public.trade_offers
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "own offers delete" on public.trade_offers;
create policy "own offers delete" on public.trade_offers
  for delete to authenticated using (auth.uid() = user_id);

drop trigger if exists trg_touch_offers_updated_at on public.trade_offers;
create trigger trg_touch_offers_updated_at
  before update on public.trade_offers
  for each row execute function public.touch_updated_at();
