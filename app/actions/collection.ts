"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { COLLECTION_LIMITS, type CollectionMap, type QuantityUpdateResult } from "@/lib/types";

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

function revalidateCollectionPaths(): void {
  revalidatePath("/");
  revalidatePath("/collezione");
  revalidatePath("/paese/[country]", "page");
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

  revalidateCollectionPaths();
  return { coinId, quantity: clean };
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
  return setCoinQuantity(coinId, current + 1);
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
  return setCoinQuantity(coinId, current - 1);
}
