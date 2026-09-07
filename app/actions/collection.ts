"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { CollectionMap } from "@/lib/types";

async function requireUserId() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  return { supabase, userId: user.id };
}

/** Collezione dell'utente loggato: { [coin_id]: quantity } */
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
): Promise<{ coinId: string; quantity: number }> {
  const { supabase, userId } = await requireUserId();
  const clean = Number.isFinite(qty)
    ? Math.max(0, Math.min(99, Math.floor(qty)))
    : 0;

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

  revalidatePath("/");
  revalidatePath("/collezione");
  revalidatePath("/paese/[country]", "page");
  return { coinId, quantity: clean };
}

/** Scorciatoie per i pulsanti + / − (il client passa il valore atteso: niente race). */
export async function incrementCoin(coinId: string, current: number) {
  return setCoinQuantity(coinId, (current || 0) + 1);
}

export async function decrementCoin(coinId: string, current: number) {
  return setCoinQuantity(coinId, (current || 0) - 1);
}
