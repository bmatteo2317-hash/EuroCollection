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

-- Amicizie e scambi (v2 sociale): profili pubblici, richieste di amicizia
-- e offerte di scambio visibili ai soli amici. Vedi migration_005.
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

insert into public.profiles (id, display_name)
select u.id, split_part(coalesce(u.email, 'collezionista'), '@', 1)
from auth.users u
on conflict (id) do nothing;

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

create or replace function public.is_friend(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.friendships
    where status = 'accepted'
      and ((requester_id = a and addressee_id = b)
        or (requester_id = b and addressee_id = a))
  );
$$;

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

-- Richieste di scambio (v2 sociale): "ti do la mia A per la tua B".
-- Accettazione = accordo; lo scambio fisico si conferma dopo con
-- complete_trade_request(). Vedi migration_006 + migration_007.
create table if not exists public.trade_requests (
  id uuid primary key default gen_random_uuid(),
  proposer_id uuid not null references auth.users (id) on delete cascade,
  addressee_id uuid not null references auth.users (id) on delete cascade,
  offered_offer_id uuid references public.trade_offers (id) on delete set null,
  requested_offer_id uuid references public.trade_offers (id) on delete set null,
  offered_coin_id text not null,
  offered_year integer,
  requested_coin_id text not null,
  requested_year integer,
  accepted_offered_year integer,
  accepted_requested_year integer,
  message text,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'cancelled', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (proposer_id <> addressee_id)
);

alter table public.trade_requests enable row level security;

drop policy if exists "own requests select" on public.trade_requests;
create policy "own requests select" on public.trade_requests
  for select to authenticated
  using (auth.uid() = proposer_id or auth.uid() = addressee_id);

drop policy if exists "own requests insert" on public.trade_requests;
create policy "own requests insert" on public.trade_requests
  for insert to authenticated with check (auth.uid() = proposer_id);

drop policy if exists "own requests update" on public.trade_requests;
create policy "own requests update" on public.trade_requests
  for update to authenticated
  using (auth.uid() = proposer_id or auth.uid() = addressee_id)
  with check (auth.uid() = proposer_id or auth.uid() = addressee_id);

drop policy if exists "own requests delete" on public.trade_requests;
create policy "own requests delete" on public.trade_requests
  for delete to authenticated
  using (auth.uid() = proposer_id or auth.uid() = addressee_id);

drop trigger if exists trg_touch_requests_updated_at on public.trade_requests;
create trigger trg_touch_requests_updated_at
  before update on public.trade_requests
  for each row execute function public.touch_updated_at();

create or replace function public.move_one_unit(
  p_giver uuid, p_receiver uuid, p_coin text, p_year int
)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_year int := p_year;
  v_qty int;
  v_sum int;
begin
  if v_year is null then
    select year into v_year from public.user_collection_years
    where user_id = p_giver and coin_id = p_coin and quantity > 0
    order by quantity desc, year asc limit 1;
  end if;

  if v_year is not null then
    update public.user_collection_years set quantity = quantity - 1
    where user_id = p_giver and coin_id = p_coin and year = v_year
    returning quantity into v_qty;
    if not found then raise exception 'NOT_OWNED'; end if;
    if v_qty <= 0 then
      delete from public.user_collection_years
      where user_id = p_giver and coin_id = p_coin and year = v_year;
    end if;

    insert into public.user_collection_years (user_id, coin_id, year, quantity)
    values (p_receiver, p_coin, v_year, 1)
    on conflict (user_id, coin_id, year)
    do update set quantity = public.user_collection_years.quantity + 1;

    select coalesce(sum(quantity), 0) into v_sum
    from public.user_collection_years
    where user_id = p_giver and coin_id = p_coin;
    if v_sum <= 0 then
      delete from public.user_collection
      where user_id = p_giver and coin_id = p_coin;
    else
      insert into public.user_collection (user_id, coin_id, quantity)
      values (p_giver, p_coin, v_sum)
      on conflict (user_id, coin_id)
      do update set quantity = excluded.quantity;
    end if;

    select coalesce(sum(quantity), 0) into v_sum
    from public.user_collection_years
    where user_id = p_receiver and coin_id = p_coin;
    insert into public.user_collection (user_id, coin_id, quantity)
    values (p_receiver, p_coin, v_sum)
    on conflict (user_id, coin_id)
    do update set quantity = excluded.quantity;
  else
    update public.user_collection set quantity = quantity - 1
    where user_id = p_giver and coin_id = p_coin
    returning quantity into v_qty;
    if not found then raise exception 'NOT_OWNED'; end if;
    if v_qty <= 0 then
      delete from public.user_collection
      where user_id = p_giver and coin_id = p_coin;
    end if;

    insert into public.user_collection (user_id, coin_id, quantity)
    values (p_receiver, p_coin, 1)
    on conflict (user_id, coin_id)
    do update set quantity = public.user_collection.quantity + 1;
  end if;

  return v_year;
end $$;

create or replace function public.accept_trade_request(p_request_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  r public.trade_requests%rowtype;
begin
  select * into r from public.trade_requests
  where id = p_request_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if r.addressee_id <> auth.uid() then raise exception 'FORBIDDEN'; end if;
  if r.status <> 'pending' then raise exception 'STATE'; end if;

  update public.trade_requests
  set status = 'accepted'
  where id = p_request_id;
end $$;

create or replace function public.complete_trade_request(p_request_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  r public.trade_requests%rowtype;
  v_offered record;
  v_requested record;
  v_offered_year int;
  v_requested_year int;
begin
  select * into r from public.trade_requests
  where id = p_request_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if r.proposer_id <> auth.uid() and r.addressee_id <> auth.uid() then
    raise exception 'FORBIDDEN';
  end if;
  if r.status <> 'accepted' then raise exception 'STATE'; end if;

  select * into v_offered from public.trade_offers
  where id = r.offered_offer_id for update;
  if not found or v_offered.quantity < 1 then
    raise exception 'OFFER_UNAVAILABLE';
  end if;
  select * into v_requested from public.trade_offers
  where id = r.requested_offer_id for update;
  if not found or v_requested.quantity < 1 then
    raise exception 'OFFER_UNAVAILABLE';
  end if;

  v_offered_year := public.move_one_unit(
    r.proposer_id, r.addressee_id, r.offered_coin_id, r.offered_year);
  v_requested_year := public.move_one_unit(
    r.addressee_id, r.proposer_id, r.requested_coin_id, r.requested_year);

  update public.trade_offers set quantity = quantity - 1
  where id = r.offered_offer_id;
  delete from public.trade_offers
  where id = r.offered_offer_id and quantity <= 0;
  update public.trade_offers set quantity = quantity - 1
  where id = r.requested_offer_id;
  delete from public.trade_offers
  where id = r.requested_offer_id and quantity <= 0;

  update public.trade_requests
  set status = 'completed',
      accepted_offered_year = v_offered_year,
      accepted_requested_year = v_requested_year
  where id = p_request_id;
end $$;
