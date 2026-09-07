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

export async function fetchOwnership(
  supabase: SupabaseClient,
  userId: string
): Promise<OwnershipFetch> {
  const { data, error } = await supabase
    .from("user_collection")
    .select("coin_id, quantity, grade, notes")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  const details: OwnershipMap = {};
  for (const row of data ?? []) {
    if (row.quantity > 0) details[row.coin_id] = toOwnership(row);
  }
  return { details, quantities: toCollectionMap(details) };
}
