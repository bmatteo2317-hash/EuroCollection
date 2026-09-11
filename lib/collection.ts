import { sql } from "@/lib/db";
import {
  toCollectionMap,
  toOwnership,
  type CoinYearsMap,
  type CollectionMap,
  type OwnershipMap,
} from "@/lib/types";

/**
 * Helper SOLO server: legge `user_collection` (quantità + grado + note)
 * da Neon e restituisce sia la mappa dettagli che la mappa quantità.
 * Da usare nei Server Component / Server Action, mai nel client.
 */
export interface OwnershipFetch {
  quantities: CollectionMap;
  details: OwnershipMap;
}

interface OwnershipRow {
  coin_id: string;
  quantity: number;
  grade: string | null;
  notes: string | null;
}

interface YearRow {
  coin_id: string;
  year: number;
  quantity: number;
}

export const MISSING_COLUMNS_MESSAGE =
  "Manca lo schema su Neon: esegui neon/schema.sql nel SQL Editor di Neon.";

export const MISSING_YEARS_TABLE_MESSAGE =
  "Manca la tabella anni su Neon: esegui neon/schema.sql nel SQL Editor di Neon.";

export async function fetchOwnership(userId: string): Promise<OwnershipFetch> {
  const rows = (await sql()`
    SELECT coin_id, quantity, grade, notes
    FROM public.user_collection
    WHERE user_id = ${userId}
  `) as unknown as OwnershipRow[];
  const details: OwnershipMap = {};
  for (const row of rows ?? []) {
    if (row.quantity > 0) details[row.coin_id] = toOwnership(row);
  }
  return { details, quantities: toCollectionMap(details) };
}

/** Anni posseduti per disegno (`coin_id -> { year: qty }`). */
export async function fetchYears(userId: string): Promise<CoinYearsMap> {
  const rows = (await sql()`
    SELECT coin_id, year, quantity
    FROM public.user_collection_years
    WHERE user_id = ${userId}
  `) as unknown as YearRow[];
  const map: CoinYearsMap = {};
  for (const row of rows ?? []) {
    if (row.quantity > 0) {
      const perCoin = map[row.coin_id] ?? {};
      perCoin[row.year] = row.quantity;
      map[row.coin_id] = perCoin;
    }
  }
  return map;
}
