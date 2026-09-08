-- Migrazione 006: richieste di scambio.
-- Esegui nel SQL Editor di Supabase.
--
-- trade_requests: "ti do la mia moneta A per la tua moneta B" (1 pezzo
-- per parte). All'accettazione lo scambio avviene in automatico:
-- accept_trade_request() sposta 1 unità per lato (rispettando gli anni
-- dei divisionali e riallineando le quantità principali) e consuma
-- 1 pezzo da ciascuna offerta.

-- Richieste di scambio --------------------------------------------------
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
    check (status in ('pending', 'accepted', 'declined', 'cancelled')),
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

-- Sposta 1 pezzo di (moneta, anno) da giver a receiver.
-- Ritorna l'anno effettivamente spostato (per le offerte generiche
-- sceglie l'anno con più doppioni, così resta la copertura degli anni).
-- Anni NULL + nessun tracking anni = solo riga principale.
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

-- Accetta una richiesta: solo il destinatario, solo se pending, solo se
-- entrambe le offerte esistono ancora con almeno 1 pezzo.
create or replace function public.accept_trade_request(p_request_id uuid)
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
  if r.addressee_id <> auth.uid() then raise exception 'FORBIDDEN'; end if;
  if r.status <> 'pending' then raise exception 'STATE'; end if;

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
  set status = 'accepted',
      accepted_offered_year = v_offered_year,
      accepted_requested_year = v_requested_year
  where id = p_request_id;
end $$;
