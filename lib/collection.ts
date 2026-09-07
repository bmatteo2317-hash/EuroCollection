import type { SupabaseClient } from "@supabase/supabase-js";
import {
  toCollectionMap,
  toOwnership,
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
