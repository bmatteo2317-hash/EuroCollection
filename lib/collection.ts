import { sql, toFriendlyDbError } from "@/lib/db";
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
  try {
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
  } catch (e) {
    throw toFriendlyDbError(e, "Lettura collezione fallita: riprova tra poco.");
  }
}

/** Anni posseduti per disegno (`coin_id -> { year: qty }`). */
export async function fetchYears(userId: string): Promise<CoinYearsMap> {
  try {
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
  } catch (e) {
    throw toFriendlyDbError(e, "Lettura anni collezione fallita: riprova tra poco.");
  }
}

/**
 * Variante MAI-throw per i Server Component: un errore DB durante il render
 * (env mancante, schema assente, Neon in pausa) in produzione diventa
 * "Minified React error #441" a pagina intera. Con questi helper la pagina
 * resta consultabile (collezione vuota) e il dettaglio finisce nei log.
 */
export async function fetchOwnershipSafe(userId: string): Promise<OwnershipFetch> {
  try {
    return await fetchOwnership(userId);
  } catch (e) {
    console.error("[collection] fetchOwnershipSafe fallback vuoto:", e);
    return { details: {}, quantities: {} };
  }
}

/** Variante MAI-throw per i Server Component (vedi fetchOwnershipSafe). */
export async function fetchYearsSafe(userId: string): Promise<CoinYearsMap> {
  try {
    return await fetchYears(userId);
  } catch (e) {
    console.error("[collection] fetchYearsSafe fallback vuoto:", e);
    return {};
  }
}
