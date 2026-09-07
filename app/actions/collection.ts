"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { fetchOwnership } from "@/lib/collection";
import { isValidCountry } from "@/lib/catalog";
import {
  COLLECTION_LIMITS,
  isGrade,
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
  revalidatePath("/");
  revalidatePath("/collezione");
  // Revalidate concreto della pagina paese (il coin_id inizia con "<country>-"):
  // niente pattern con parentesi, che alcune versioni di Next rifiutano.
  const code = coinId?.split("-")[0] ?? "";
  if (isValidCountry(code)) revalidatePath(`/paese/${code}`);
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
    const { data } = await supabase
      .from("user_collection")
      .select("quantity, grade, notes")
      .eq("user_id", userId)
      .eq("coin_id", coinId)
      .maybeSingle();
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
  if (error) throw new Error(error.message);
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
