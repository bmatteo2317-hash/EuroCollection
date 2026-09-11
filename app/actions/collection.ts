"use server";

import { revalidatePath } from "next/cache";
import { sql, MISSING_TABLES_MESSAGE } from "@/lib/db";
import { requireSessionUser } from "@/lib/auth";
import { fetchOwnership, fetchYears } from "@/lib/collection";
import { isValidCountry } from "@/lib/catalog";
import {
  COLLECTION_LIMITS,
  isGrade,
  type CoinYearsMap,
  type CollectionMap,
  type Grade,
  type Ownership,
  type OwnershipMap,
  type QuantityUpdateResult,
} from "@/lib/types";

function clampQuantity(qty: number): number {
  if (!Number.isFinite(qty)) return 0;
  return Math.max(
    COLLECTION_LIMITS.MIN,
    Math.min(COLLECTION_LIMITS.MAX, Math.floor(qty))
  );
}

async function requireUserId(): Promise<string> {
  const user = await requireSessionUser();
  return user.id;
}

function revalidateCollectionPaths(coinId?: string): void {
  // Best-effort: la scrittura su DB è già avvenuta quando questa funzione
  // viene chiamata. Se la revalidazione (o il re-render server che ne
  // consegue) fallisse, non deve far fallire l'action con un
  // "Minified React error #441" ribaltando l'ottimistica in UI.
  const paths = ["/", "/collezione"];
  // Revalidate concreto della pagina paese (il coin_id inizia con "<country>-"):
  // niente pattern con parentesi, che alcune versioni di Next rifiutano.
  const code = coinId?.split("-")[0] ?? "";
  if (isValidCountry(code)) paths.push(`/paese/${code}`);
  for (const path of paths) {
    try {
      revalidatePath(path);
    } catch (e) {
      console.warn(`[collection] revalidatePath(${path}) fallita:`, e);
    }
  }
}

/**
 * Scrive la quantità: qty <= 0 → DELETE, qty > 0 → UPSERT su (user_id, coin_id).
 */
async function applyQuantity(
  userId: string,
  coinId: string,
  qty: number
): Promise<QuantityUpdateResult> {
  const clean = clampQuantity(qty);

  if (clean <= 0) {
    await sql()`DELETE FROM public.user_collection WHERE user_id = ${userId} AND coin_id = ${coinId}`;
  } else {
    await sql()`
      INSERT INTO public.user_collection (user_id, coin_id, quantity)
      VALUES (${userId}, ${coinId}, ${clean})
      ON CONFLICT (user_id, coin_id)
      DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = now()
    `;
  }

  revalidateCollectionPaths(coinId);
  return { coinId, quantity: clean };
}

/** Collezione dell'utente loggato: { [coin_id]: quantity }. */
export async function getMyCollection(): Promise<CollectionMap> {
  const userId = await requireUserId();
  const rows = (await sql()`
    SELECT coin_id, quantity FROM public.user_collection WHERE user_id = ${userId}
  `) as unknown as { coin_id: string; quantity: number }[];
  const map: CollectionMap = {};
  for (const row of rows ?? []) {
    if (row.quantity > 0) map[row.coin_id] = row.quantity;
  }
  return map;
}

/**
 * Quantità esatta di una moneta.
 * qty <= 0 → DELETE (torna B/N in UI). qty > 0 → UPSERT su (user_id, coin_id).
 */
export async function setCoinQuantity(
  coinId: string,
  qty: number
): Promise<QuantityUpdateResult> {
  const userId = await requireUserId();
  return applyQuantity(userId, coinId, qty);
}

/** Incrementa di 1 la quantità posseduta (lettura + upsert). */
export async function incrementCoin(
  coinId: string
): Promise<QuantityUpdateResult> {
  const userId = await requireUserId();
  const rows = (await sql()`
    SELECT quantity FROM public.user_collection
    WHERE user_id = ${userId} AND coin_id = ${coinId} LIMIT 1
  `) as unknown as { quantity: number }[];
  const current = rows[0]?.quantity ?? 0;
  return applyQuantity(userId, coinId, current + 1);
}

/** Decrementa di 1 (a zero esegue DELETE). */
export async function decrementCoin(
  coinId: string
): Promise<QuantityUpdateResult> {
  const userId = await requireUserId();
  const rows = (await sql()`
    SELECT quantity FROM public.user_collection
    WHERE user_id = ${userId} AND coin_id = ${coinId} LIMIT 1
  `) as unknown as { quantity: number }[];
  const current = rows[0]?.quantity ?? 0;
  return applyQuantity(userId, coinId, current - 1);
}

/** Dettagli completi (quantità + grado + note) dell'utente loggato. */
export async function getMyOwnership(): Promise<OwnershipMap> {
  const userId = await requireUserId();
  return (await fetchOwnership(userId)).details;
}

/** Anni posseduti per disegno (`coin_id -> { year: qty }`). */
export async function getMyYears(): Promise<CoinYearsMap> {
  const userId = await requireUserId();
  return fetchYears(userId);
}

export interface ToggleYearResult {
  coinId: string;
  year: number;
  /** Quantità dell'anno dopo l'operazione (0 = rimosso, N = doppioni). */
  quantity: number;
  /** Anni distinti posseduti del disegno (per sync ottimistica del badge). */
  ownedYears: number;
  /** Pezzi totali del disegno = somma quantità per anno (doppioni inclusi). */
  totalPieces: number;
}

function cleanYear(year: number): number {
  const cleanYear = Math.floor(year);
  if (!Number.isFinite(cleanYear) || cleanYear < 1999 || cleanYear > 2100) {
    throw new Error("INVALID_YEAR");
  }
  return cleanYear;
}

/**
 * Somma i pezzi posseduti di un disegno (SOMMA quantity) e sincronizza la
 * riga principale `user_collection.quantity`. Ritorna { distinti, pezzi }.
 */
async function syncMainRowFromYears(
  userId: string,
  coinId: string
): Promise<{ ownedYears: number; totalPieces: number }> {
  const rows = (await sql()`
    SELECT quantity FROM public.user_collection_years
    WHERE user_id = ${userId} AND coin_id = ${coinId}
  `) as unknown as { quantity: number }[];
  const list = rows ?? [];
  const ownedYears = list.filter((r) => (r.quantity ?? 0) > 0).length;
  const totalPieces = list.reduce(
    (sum, r) => sum + Math.max(0, r.quantity ?? 0),
    0
  );
  await applyQuantity(userId, coinId, totalPieces);
  return { ownedYears, totalPieces };
}

/**
 * Imposta la quantità esatta (doppioni) di un anno di un disegno.
 * qty <= 0 → DELETE dell'anno; qty > 0 → UPSERT su (user_id, coin_id, year).
 * La riga principale viene sincronizzata = SOMMA pezzi di tutti gli anni.
 */
export async function setCoinYearQuantity(
  coinId: string,
  year: number,
  qty: number
): Promise<ToggleYearResult> {
  const y = cleanYear(year);
  const clean = clampQuantity(qty);
  const userId = await requireUserId();

  try {
    if (clean <= 0) {
      await sql()`DELETE FROM public.user_collection_years WHERE user_id = ${userId} AND coin_id = ${coinId} AND year = ${y}`;
    } else {
      await sql()`
        INSERT INTO public.user_collection_years (user_id, coin_id, year, quantity)
        VALUES (${userId}, ${coinId}, ${y}, ${clean})
        ON CONFLICT (user_id, coin_id, year)
        DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = now()
      `;
    }
  } catch (e) {
    console.error("[collection] setCoinYearQuantity fallita:", e);
    throw new Error(MISSING_TABLES_MESSAGE);
  }

  const { ownedYears, totalPieces } = await syncMainRowFromYears(
    userId,
    coinId
  );
  return { coinId, year: y, quantity: clean, ownedYears, totalPieces };
}

/** +1 pezzo di un anno (doppione dello stesso anno). */
export async function incrementCoinYear(
  coinId: string,
  year: number
): Promise<ToggleYearResult> {
  const y = cleanYear(year);
  const userId = await requireUserId();
  const rows = (await sql()`
    SELECT quantity FROM public.user_collection_years
    WHERE user_id = ${userId} AND coin_id = ${coinId} AND year = ${y} LIMIT 1
  `) as unknown as { quantity: number }[];
  return setCoinYearQuantity(coinId, y, (rows[0]?.quantity ?? 0) + 1);
}

/** −1 pezzo di un anno (a zero l'anno viene rimosso). */
export async function decrementCoinYear(
  coinId: string,
  year: number
): Promise<ToggleYearResult> {
  const y = cleanYear(year);
  const userId = await requireUserId();
  const rows = (await sql()`
    SELECT quantity FROM public.user_collection_years
    WHERE user_id = ${userId} AND coin_id = ${coinId} AND year = ${y} LIMIT 1
  `) as unknown as { quantity: number }[];
  return setCoinYearQuantity(coinId, y, (rows[0]?.quantity ?? 0) - 1);
}

/**
 * Spunta / deseleziona un anno di un disegno divisionale (toggle 0 ↔ 1).
 * La riga principale viene sincronizzata = SOMMA dei pezzi di tutti gli anni.
 */
export async function toggleCoinYear(
  coinId: string,
  year: number
): Promise<ToggleYearResult> {
  const y = cleanYear(year);
  const userId = await requireUserId();

  const rows = (await sql()`
    SELECT quantity FROM public.user_collection_years
    WHERE user_id = ${userId} AND coin_id = ${coinId} AND year = ${y} LIMIT 1
  `) as unknown as { quantity: number }[];
  const has = (rows[0]?.quantity ?? 0) > 0;

  if (has) {
    await sql()`DELETE FROM public.user_collection_years WHERE user_id = ${userId} AND coin_id = ${coinId} AND year = ${y}`;
  } else {
    await sql()`
      INSERT INTO public.user_collection_years (user_id, coin_id, year, quantity)
      VALUES (${userId}, ${coinId}, ${y}, 1)
      ON CONFLICT (user_id, coin_id, year)
      DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = now()
    `;
  }

  const { ownedYears, totalPieces } = await syncMainRowFromYears(
    userId,
    coinId
  );
  return { coinId, year: y, quantity: has ? 0 : 1, ownedYears, totalPieces };
}

function cleanGrade(grade: Grade | null | undefined): Grade | null {
  return isGrade(grade ?? null) ? (grade as Grade) : null;
}

function cleanNotes(notes: string | null | undefined): string | null {
  if (typeof notes !== "string") return null;
  const trimmed = notes.trim().slice(0, COLLECTION_LIMITS.MAX_NOTES_LENGTH);
  return trimmed ? trimmed : null;
}

export interface CoinDetailsInput {
  grade?: Grade | null;
  notes?: string | null;
}

export interface CoinDetailsResult {
  coinId: string;
  ownership: Ownership | null;
}

/**
 * Aggiorna grado di conservazione e note di una moneta posseduta.
 * Richiede qty >= 1 (prima premi +). I campi non passati restano invariati.
 */
export async function updateCoinDetails(
  coinId: string,
  input: CoinDetailsInput
): Promise<CoinDetailsResult> {
  const userId = await requireUserId();
  const patch: { grade?: Grade | null; notes?: string | null } = {};
  if (input.grade !== undefined) patch.grade = cleanGrade(input.grade);
  if (input.notes !== undefined) patch.notes = cleanNotes(input.notes);

  const readRows = async () => {
    const rows = (await sql()`
      SELECT quantity, grade, notes FROM public.user_collection
      WHERE user_id = ${userId} AND coin_id = ${coinId} LIMIT 1
    `) as unknown as { quantity: number; grade: string | null; notes: string | null }[];
    return rows[0] ?? null;
  };

  if (Object.keys(patch).length === 0) {
    const data = await readRows();
    if (!data || data.quantity <= 0) return { coinId, ownership: null };
    return {
      coinId,
      ownership: {
        quantity: data.quantity,
        grade: isGrade(data.grade) ? data.grade : null,
        notes: data.notes ?? null,
      },
    };
  }

  const grade = patch.grade ?? null;
  const notes = patch.notes ?? null;
  const updated = (await sql()`
    UPDATE public.user_collection
    SET grade = ${grade}, notes = ${notes}, updated_at = now()
    WHERE user_id = ${userId} AND coin_id = ${coinId} AND quantity > 0
    RETURNING quantity, grade, notes
  `) as unknown as { quantity: number; grade: string | null; notes: string | null }[];
  const data = updated[0] ?? null;
  if (!data) throw new Error("NOT_OWNED");

  revalidateCollectionPaths(coinId);
  return {
    coinId,
    ownership: {
      quantity: data.quantity,
      grade: isGrade(data.grade) ? data.grade : null,
      notes: data.notes ?? null,
    },
  };
}

/** Dettagli di un anno specifico (grado + note del singolo anno). */
export async function getCoinYearDetails(
  coinId: string,
  year: number
): Promise<{ grade: Grade | null; notes: string | null; quantity: number }> {
  const y = cleanYear(year);
  const userId = await requireUserId();
  const rows = (await sql()`
    SELECT quantity, grade, notes FROM public.user_collection_years
    WHERE user_id = ${userId} AND coin_id = ${coinId} AND year = ${y} LIMIT 1
  `) as unknown as { quantity: number; grade: string | null; notes: string | null }[];
  const row = rows[0];
  if (!row) return { grade: null, notes: null, quantity: 0 };
  return {
    grade: isGrade(row.grade) ? row.grade : null,
    notes: row.notes ?? null,
    quantity: row.quantity,
  };
}

/** Aggiorna grado + note di un singolo anno posseduto. */
export async function updateCoinYearDetails(
  coinId: string,
  year: number,
  input: CoinDetailsInput
): Promise<void> {
  const y = cleanYear(year);
  const userId = await requireUserId();
  const grade = input.grade !== undefined ? cleanGrade(input.grade) : undefined;
  const notes = input.notes !== undefined ? cleanNotes(input.notes) : undefined;
  if (grade !== undefined && notes !== undefined) {
    await sql()`UPDATE public.user_collection_years SET grade = ${grade}, notes = ${notes}, updated_at = now() WHERE user_id = ${userId} AND coin_id = ${coinId} AND year = ${y}`;
  } else if (grade !== undefined) {
    await sql()`UPDATE public.user_collection_years SET grade = ${grade}, updated_at = now() WHERE user_id = ${userId} AND coin_id = ${coinId} AND year = ${y}`;
  } else if (notes !== undefined) {
    await sql()`UPDATE public.user_collection_years SET notes = ${notes}, updated_at = now() WHERE user_id = ${userId} AND coin_id = ${coinId} AND year = ${y}`;
  }
  revalidateCollectionPaths(coinId);
}
