/**
 * Tipi condivisi della collezione.
 *
 * `coin_id` è l'ID stabile generato da `coinId()` in `lib/catalog.ts`
 * (formato "<country>-<year>-<denomination>-<type>-<index>",
 * es. "it-2004-2euro-commemorative-0") e corrisponde alla chiave primaria
 * logica della tabella Supabase `public.user_collection (user_id, coin_id)`.
 */

/** Mappa `coin_id -> quantity` usata dalla UI (anche ottimistica). */
export type CollectionMap = Record<string, number>;

/** Riga della tabella `public.user_collection` (sottoinsieme letto dal client). */
export interface CollectionRow {
  coin_id: string;
  quantity: number;
  updated_at: string;
}

/** Statistiche aggregate della collezione di un utente. */
export interface CollectionStats {
  /** Tipi distinti posseduti (quantity >= 1). */
  owned: number;
  /** Totale monete del catalogo Eurozona. */
  total: number;
  /** Percentuale completamento 0..100. */
  percent: number;
  /** Pezzi totali (somma delle quantità). */
  pieces: number;
}

/** Risultato restituito dalle Server Action di aggiornamento quantità. */
export interface QuantityUpdateResult {
  coinId: string;
  quantity: number;
}

/** Profilo utente minimo usato nelle pagine server. */
export interface AuthUserInfo {
  id: string;
  email: string | null;
}

/** Limiti di quantità accettati (coerenti con Server Action + UI). */
export const COLLECTION_LIMITS = {
  MIN: 0,
  MAX: 99,
} as const;

/** Calcola le statistiche a partire da catalogo totale + mappa collezione. */
export function buildCollectionStats(
  collection: CollectionMap,
  total: number
): CollectionStats {
  const entries = Object.entries(collection).filter(([, qty]) => qty > 0);
  const owned = entries.length;
  const pieces = entries.reduce((sum, [, qty]) => sum + qty, 0);
  const percent = total > 0 ? (owned / total) * 100 : 0;
  return { owned, total, percent, pieces };
}
