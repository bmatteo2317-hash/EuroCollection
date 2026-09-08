-- Migrazione 004: anno + doppioni completi per disegno divisionale.
-- Esegui nel SQL Editor di Supabase.
--
-- PROBLEMA RISOLTO:
-- 1) "Memorizzazione anno": prima l'anno posseduto viveva solo in
--    user_collection_years con quantity sempre 1 e senza grado/note.
--    Ora ogni riga (user_id, coin_id, year) memorizza:
--      quantity = doppioni di QUELL'ANNO (1 = posseduto, 2+ = doppioni)
--      grade    = conservazione di quell'anno (FDC/SPL/BB/MB/B, NULL = n/d)
--      notes    = note di quell'anno (acquisto, prezzo, varianti...)
-- 2) "Doppioni": prima il toggle faceva solo 0/1 e la riga principale
--    (user_collection.quantity) era = CONTEGGIO anni distinti.
--    Ora la riga principale è = SOMMA delle quantity per anno
--    (totale pezzi di quel disegno), così badge x2, filtro "Doppioni (x2+)",
--    statistiche e dashboard restano coerenti.
--
-- coin_id resta l'ID disegno del catalogo (lib/catalog.ts), es.
-- "it-2002-2euro-regular-0" (l'anno dentro è l'anno del DISEGNO, non quello
-- posseduto). L'anno posseduto è la colonna `year` di questa tabella.

alter table public.user_collection_years
  add column if not exists grade text,
  add column if not exists notes text,
  add column if not exists updated_at timestamptz not null default now();

-- Vincolo morbido sui gradi ammessi (NULL consentito = non specificato),
-- come su user_collection (migration_002).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'chk_user_collection_years_grade'
  ) then
    alter table public.user_collection_years
      add constraint chk_user_collection_years_grade
      check (grade is null or grade in ('FDC', 'SPL', 'BB', 'MB', 'B'));
  end if;
end $$;

-- updated_at automatico come su user_collection.
drop trigger if exists trg_touch_years_updated_at on public.user_collection_years;
create trigger trg_touch_years_updated_at
  before update on public.user_collection_years
  for each row execute function public.touch_updated_at();

-- Indice per lookup (user, coin) usato dalla sync somma-pezzi del server.
create index if not exists idx_user_collection_years_coin
  on public.user_collection_years (user_id, coin_id);
