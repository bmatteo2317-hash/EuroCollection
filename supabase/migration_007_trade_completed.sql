-- Migrazione 007: scambio in due tempi.
-- Esegui nel SQL Editor di Supabase.
--
-- Nuovo flusso: proposta (pending) → accettazione = accordo (accepted,
-- NESSUN movimento di monete) → al passaggio fisico di mano una delle
-- parti clicca "Scambio effettuato" e complete_trade_request() sposta
-- 1 pezzo per lato e chiude la richiesta come completed.

-- Allarga gli stati ammessi a 'completed' (vincolo ricreato: il nome
-- auto-generato varia se la tabella è stata creata a mano).
do $$ declare cname text; begin
  select conname into cname from pg_constraint
  where conrelid = 'public.trade_requests'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%status%';
  if cname is not null then
    execute format('alter table public.trade_requests drop constraint %I', cname);
  end if;
  alter table public.trade_requests
    add constraint trade_requests_status_check
    check (status in ('pending', 'accepted', 'declined', 'cancelled', 'completed'));
end $$;

-- Accettazione = solo accordo (destinatario, solo se pending).
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

-- Scambio fisico: una delle due parti conferma l'avvenuto passaggio.
-- Sposta 1 pezzo per lato (rispettando gli anni), consuma 1 pezzo da
-- ciascuna offerta e chiude come completed.
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
