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
  grade: Grade | null;
  notes: string | null;
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
  /** Lunghezza massima del campo note libere. */
  MAX_NOTES_LENGTH: 500,
} as const;

/** Gradi di conservazione (standard numismatici italiani). */
export const GRADES = ["FDC", "SPL", "BB", "MB", "B"] as const;

/** Grado di conservazione: FDC = Fior di Conio, SPL = Splendido, BB = Bellissimo, MB = Molto Bello, B = Bello. */
export type Grade = (typeof GRADES)[number];

export function isGrade(value: string | null | undefined): value is Grade {
  return (
    typeof value === "string" && (GRADES as readonly string[]).includes(value)
  );
}

/** Dettagli di possesso di una moneta: conservazione + note d'acquisto. */
export interface Ownership {
  quantity: number;
  grade: Grade | null;
  notes: string | null;
}

/** Mappa `coin_id -> Ownership` (quantità + grado + note). */
export type OwnershipMap = Record<string, Ownership>;

/** Costruisce una Ownership da una riga DB grezza (tollerante ai NULL). */
export function toOwnership(row: {
  quantity: number;
  grade?: string | null;
  notes?: string | null;
}): Ownership {
  return {
    quantity: row.quantity,
    grade: isGrade(row.grade ?? null) ? (row.grade as Grade) : null,
    notes: row.notes?.trim() ? row.notes : null,
  };
}

/** Deriva la mappa quantità dalla mappa dettagli (per compatibilità UI). */
export function toCollectionMap(ownership: OwnershipMap): CollectionMap {
  const map: CollectionMap = {};
  for (const [id, own] of Object.entries(ownership)) {
    if (own.quantity > 0) map[id] = own.quantity;
  }
  return map;
}

/**
 * Anni posseduti per disegno: `coin_id -> { [year]: quantity }`.
 * Le chiavi anno arrivano dal DB come interi; in JS diventano stringhe,
 * ma l'accesso con numero (`map[id]?.[2024]`) funziona comunque.
 */
export type CoinYearsMap = Record<string, Record<number, number>>;

/** Quantità posseduta di uno specifico anno di un disegno (0 se mancante). */
export function getYearQuantity(
  years: CoinYearsMap,
  coinId: string,
  year: number
): number {
  return years[coinId]?.[year] ?? 0;
}

/** Anni posseduti (ordinati) di un disegno. */
export function getOwnedYears(
  years: CoinYearsMap,
  coinId: string
): number[] {
  return Object.entries(years[coinId] ?? {})
    .filter(([, qty]) => qty > 0)
    .map(([y]) => Number(y))
    .sort((a, b) => a - b);
}

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
