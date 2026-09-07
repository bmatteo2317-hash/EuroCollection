-- Migrazione 002: grado di conservazione e note per riga di collezione.
-- Esegui nel SQL Editor di Supabase (oppure applica a schema.sql per nuovi progetti).
--
-- grade: stato di conservazione (FDC, SPL, BB, MB, B) — NULL = non specificato.
-- notes: testo libero (luogo/data acquisto, prezzo, varianti, ...).

alter table public.user_collection
  add column if not exists grade text,
  add column if not exists notes text;

-- Vincolo morbido sui gradi ammessi (NULL consentito = non specificato).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'chk_user_collection_grade'
  ) then
    alter table public.user_collection
      add constraint chk_user_collection_grade
      check (grade is null or grade in ('FDC', 'SPL', 'BB', 'MB', 'B'));
  end if;
end $$;
