"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { fetchOwnership, fetchYears, isMissingColumnError, isMissingTableError, MISSING_COLUMNS_MESSAGE, MISSING_YEARS_TABLE_MESSAGE } from "@/lib/collection";
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

type ServerSupabase = Awaited<ReturnType<typeof createClient>>;

function clampQuantity(qty: number): number {
  if (!Number.isFinite(qty)) return 0;
  return Math.max(
    COLLECTION_LIMITS.MIN,
    Math.min(COLLECTION_LIMITS.MAX, Math.floor(qty))
  );
}

async function requireUserId() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  return { supabase, userId: user.id };
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
 * Scrive la quantità con UN SOLO client autenticato (niente doppia getUser):
 * qty <= 0 → DELETE, qty > 0 → UPSERT su (user_id, coin_id).
 */
async function applyQuantity(
  supabase: ServerSupabase,
  userId: string,
  coinId: string,
  qty: number
): Promise<QuantityUpdateResult> {
  const clean = clampQuantity(qty);

  if (clean <= 0) {
    const { error } = await supabase
      .from("user_collection")
      .delete()
      .eq("user_id", userId)
      .eq("coin_id", coinId);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("user_collection").upsert(
      { user_id: userId, coin_id: coinId, quantity: clean },
      { onConflict: "user_id,coin_id" }
    );
    if (error) throw new Error(error.message);
  }

  revalidateCollectionPaths(coinId);
  return { coinId, quantity: clean };
}

/** Collezione dell'utente loggato: { [coin_id]: quantity }. */
export async function getMyCollection(): Promise<CollectionMap> {
  const { supabase, userId } = await requireUserId();
  const { data, error } = await supabase
    .from("user_collection")
    .select("coin_id, quantity")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  const map: CollectionMap = {};
  for (const row of data ?? []) {
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
  const { supabase, userId } = await requireUserId();
  return applyQuantity(supabase, userId, coinId, qty);
}

/**
 * Incrementa di 1 la quantità posseduta.
 * Legge il valore corrente dal DB (nessuna race sul client),
 * poi riusa `setCoinQuantity` per upsert + revalidate.
 */
export async function incrementCoin(
  coinId: string
): Promise<QuantityUpdateResult> {
  const { supabase, userId } = await requireUserId();
  const { data, error } = await supabase
    .from("user_collection")
    .select("quantity")
    .eq("user_id", userId)
    .eq("coin_id", coinId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const current = data?.quantity ?? 0;
  return applyQuantity(supabase, userId, coinId, current + 1);
}

/**
 * Decrementa di 1 la quantità posseduta.
 * A zero esegue DELETE così la moneta torna "non posseduta" in UI.
 */
export async function decrementCoin(
  coinId: string
): Promise<QuantityUpdateResult> {
  const { supabase, userId } = await requireUserId();
  const { data, error } = await supabase
    .from("user_collection")
    .select("quantity")
    .eq("user_id", userId)
    .eq("coin_id", coinId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const current = data?.quantity ?? 0;
  return applyQuantity(supabase, userId, coinId, current - 1);
}

/** Dettagli completi (quantità + grado + note) dell'utente loggato. */
export async function getMyOwnership(): Promise<OwnershipMap> {
  const { supabase, userId } = await requireUserId();
  return (await fetchOwnership(supabase, userId)).details;
}

/** Anni posseduti per disegno (`coin_id -> { year: qty }`). */
export async function getMyYears(): Promise<CoinYearsMap> {
  const { supabase, userId } = await requireUserId();
  return fetchYears(supabase, userId);
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
 * Somma i pezzi posseduti di un disegno (SOMMA quantity, non conteggio
 * righe: così i doppioni dello stesso anno contano) e sincronizza la riga
 * principale `user_collection.quantity` (include revalidate dei path).
 * Ritorna { distinti, pezzi }.
 */
async function syncMainRowFromYears(
  supabase: ServerSupabase,
  userId: string,
  coinId: string
): Promise<{ ownedYears: number; totalPieces: number }> {
  const owned = await supabase
    .from("user_collection_years")
    .select("quantity")
    .eq("user_id", userId)
    .eq("coin_id", coinId);
  if (owned.error) throw new Error(owned.error.message);
  const rows = owned.data ?? [];
  const ownedYears = rows.filter((r) => (r.quantity ?? 0) > 0).length;
  const totalPieces = rows.reduce(
    (sum, r) => sum + Math.max(0, r.quantity ?? 0),
    0
  );
  await applyQuantity(supabase, userId, coinId, totalPieces);
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
  const { supabase, userId } = await requireUserId();

  if (clean <= 0) {
    const removed = await supabase
      .from("user_collection_years")
      .delete()
      .eq("user_id", userId)
      .eq("coin_id", coinId)
      .eq("year", y);
    if (removed.error) {
      if (isMissingTableError(removed.error)) {
        throw new Error(MISSING_YEARS_TABLE_MESSAGE);
      }
      throw new Error(removed.error.message);
    }
  } else {
    const saved = await supabase.from("user_collection_years").upsert(
      { user_id: userId, coin_id: coinId, year: y, quantity: clean },
      { onConflict: "user_id,coin_id,year" }
    );
    if (saved.error) {
      if (isMissingTableError(saved.error)) {
        throw new Error(MISSING_YEARS_TABLE_MESSAGE);
      }
      throw new Error(saved.error.message);
    }
  }

  const { ownedYears, totalPieces } = await syncMainRowFromYears(
    supabase,
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
  const { supabase, userId } = await requireUserId();
  const current = await supabase
    .from("user_collection_years")
    .select("quantity")
    .eq("user_id", userId)
    .eq("coin_id", coinId)
    .eq("year", y)
    .maybeSingle();
  if (current.error) {
    if (isMissingTableError(current.error)) {
      throw new Error(MISSING_YEARS_TABLE_MESSAGE);
    }
    throw new Error(current.error.message);
  }
  return setCoinYearQuantity(coinId, y, (current.data?.quantity ?? 0) + 1);
}

/** −1 pezzo di un anno (a zero l'anno viene rimosso). */
export async function decrementCoinYear(
  coinId: string,
  year: number
): Promise<ToggleYearResult> {
  const y = cleanYear(year);
  const { supabase, userId } = await requireUserId();
  const current = await supabase
    .from("user_collection_years")
    .select("quantity")
    .eq("user_id", userId)
    .eq("coin_id", coinId)
    .eq("year", y)
    .maybeSingle();
  if (current.error) {
    if (isMissingTableError(current.error)) {
      throw new Error(MISSING_YEARS_TABLE_MESSAGE);
    }
    throw new Error(current.error.message);
  }
  return setCoinYearQuantity(coinId, y, (current.data?.quantity ?? 0) - 1);
}

/**
 * Spunta / deseleziona un anno di un disegno divisionale (toggle 0 ↔ 1).
 * Mantenuta per compatibilità: per i doppioni usare
 * `setCoinYearQuantity` / `incrementCoinYear` / `decrementCoinYear`.
 * La riga principale (`user_collection`) viene sincronizzata dal server:
 * quantità = SOMMA dei pezzi di tutti gli anni (doppioni inclusi), così
 * badge, filtri, statistiche e dashboard restano coerenti.
 */
export async function toggleCoinYear(
  coinId: string,
  year: number
): Promise<ToggleYearResult> {
  const y = cleanYear(year);
  const { supabase, userId } = await requireUserId();

  const current = await supabase
    .from("user_collection_years")
    .select("quantity")
    .eq("user_id", userId)
    .eq("coin_id", coinId)
    .eq("year", y)
    .maybeSingle();
  if (current.error) {
    if (isMissingTableError(current.error)) {
      throw new Error(MISSING_YEARS_TABLE_MESSAGE);
    }
    throw new Error(current.error.message);
  }

  // Delega a setCoinYearQuantity così insert/delete + sync somma restano
  // in un unico posto (evita il vecchio bug: sync = count righe).
  const has = (current.data?.quantity ?? 0) > 0;
  // setCoinYearQuantity ricrea client/utente: riuso diretto qui per
  // singola connessione, poi sync somma-pezzi.
  if (has) {
    const removed = await supabase
      .from("user_collection_years")
      .delete()
      .eq("user_id", userId)
      .eq("coin_id", coinId)
      .eq("year", y);
    if (removed.error) throw new Error(removed.error.message);
  } else {
    const added = await supabase.from("user_collection_years").upsert(
      { user_id: userId, coin_id: coinId, year: y, quantity: 1 },
      { onConflict: "user_id,coin_id,year" }
    );
    if (added.error) {
      if (isMissingTableError(added.error)) {
        throw new Error(MISSING_YEARS_TABLE_MESSAGE);
      }
      throw new Error(added.error.message);
    }
  }

  const { ownedYears, totalPieces } = await syncMainRowFromYears(
    supabase,
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
  const { supabase, userId } = await requireUserId();
  const patch: { grade?: Grade | null; notes?: string | null } = {};
  if (input.grade !== undefined) patch.grade = cleanGrade(input.grade);
  if (input.notes !== undefined) patch.notes = cleanNotes(input.notes);
  if (Object.keys(patch).length === 0) {
    const { data, error } = await supabase
      .from("user_collection")
      .select("quantity, grade, notes")
      .eq("user_id", userId)
      .eq("coin_id", coinId)
      .maybeSingle();
    if (error) {
      if (isMissingColumnError(error)) throw new Error(MISSING_COLUMNS_MESSAGE);
      throw new Error(error.message);
    }
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

  const { data, error } = await supabase
    .from("user_collection")
    .update(patch)
    .eq("user_id", userId)
    .eq("coin_id", coinId)
    .gt("quantity", 0)
    .select("quantity, grade, notes")
    .maybeSingle();
  if (error) {
    if (isMissingColumnError(error)) throw new Error(MISSING_COLUMNS_MESSAGE);
    throw new Error(error.message);
  }
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
