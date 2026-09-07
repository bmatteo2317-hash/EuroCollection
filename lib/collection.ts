import type { SupabaseClient } from "@supabase/supabase-js";
import {
  toCollectionMap,
  toOwnership,
  type CoinYearsMap,
  type CollectionMap,
  type OwnershipMap,
} from "@/lib/types";

/**
 * Helper SOLO server: legge `user_collection` (quantità + grado + note)
 * e restituisce sia la mappa dettagli che la mappa quantità.
 * Da usare nei Server Component / Server Action, mai nel client.
 */
export interface OwnershipFetch {
  quantities: CollectionMap;
  details: OwnershipMap;
}

/** Errore Postgres "colonna inesistente" (42703): migration non eseguita. */
export function isMissingColumnError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  if (code === "42703") return true;
  return (
    typeof message === "string" && /column .* does not exist/i.test(message)
  );
}

export const MISSING_COLUMNS_MESSAGE =
  "Manca la migration su Supabase: esegui supabase/migration_002_grade_notes.sql nel SQL Editor.";

export const MISSING_YEARS_TABLE_MESSAGE =
  "Manca la tabella anni su Supabase: esegui supabase/migration_003_collection_years.sql nel SQL Editor.";

/** Errore Postgres "tabella inesistente" (42P01): migration non eseguita. */
export function isMissingTableError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  if (code === "42P01") return true;
  return (
    typeof message === "string" && /relation .* does not exist/i.test(message)
  );
}

export async function fetchOwnership(
  supabase: SupabaseClient,
  userId: string
): Promise<OwnershipFetch> {
  const full = await supabase
    .from("user_collection")
    .select("coin_id, quantity, grade, notes")
    .eq("user_id", userId);

  if (!full.error) {
    const details: OwnershipMap = {};
    for (const row of full.data ?? []) {
      if (row.quantity > 0) details[row.coin_id] = toOwnership(row);
    }
    return { details, quantities: toCollectionMap(details) };
  }

  // Se la migration grade/notes non è stata eseguita, non rompere tutta
  // l'app (e il pulsante +): si ripiega sulle sole quantità.
  if (isMissingColumnError(full.error)) {
    const lite = await supabase
      .from("user_collection")
      .select("coin_id, quantity")
      .eq("user_id", userId);
    if (lite.error) throw new Error(lite.error.message);
    const details: OwnershipMap = {};
    for (const row of lite.data ?? []) {
      if (row.quantity > 0) details[row.coin_id] = toOwnership(row);
    }
    return { details, quantities: toCollectionMap(details) };
  }

  throw new Error(full.error.message);
}

/**
 * Anni posseduti per disegno (`coin_id -> { year: qty }`).
 * Se la tabella anni non esiste (migration_003 non eseguita) restituisce
 * mappa vuota invece di rompere le pagine: i chip anni risultano vuoti e
 * il toggle mostra il messaggio con la migration da eseguire.
 */
export async function fetchYears(
  supabase: SupabaseClient,
  userId: string
): Promise<CoinYearsMap> {
  const { data, error } = await supabase
    .from("user_collection_years")
    .select("coin_id, year, quantity")
    .eq("user_id", userId);
  if (error) {
    if (isMissingTableError(error)) return {};
    throw new Error(error.message);
  }
  const map: CoinYearsMap = {};
  for (const row of data ?? []) {
    if (row.quantity > 0) {
      const perCoin = map[row.coin_id] ?? {};
      perCoin[row.year] = row.quantity;
      map[row.coin_id] = perCoin;
    }
  }
  return map;
}
