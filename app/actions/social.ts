"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { toFriendship, type FriendshipStatus } from "@/lib/social";
import { COLLECTION_LIMITS, isGrade } from "@/lib/types";

type ServerSupabase = Awaited<ReturnType<typeof createClient>>;

async function requireUserId() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  return { supabase, userId: user.id };
}

function touchScambi(): void {
  try {
    revalidatePath("/scambi");
  } catch (e) {
    console.warn("[social] revalidatePath(/scambi) fallita:", e);
  }
}

interface FriendshipRow {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: string;
}

async function findPair(
  supabase: ServerSupabase,
  a: string,
  b: string
): Promise<{ mine: FriendshipRow | null; theirs: FriendshipRow | null }> {
  const mine = await supabase
    .from("friendships")
    .select("id, requester_id, addressee_id, status")
    .eq("requester_id", a)
    .eq("addressee_id", b)
    .maybeSingle();
  if (mine.error) throw new Error(mine.error.message);
  const theirs = await supabase
    .from("friendships")
    .select("id, requester_id, addressee_id, status")
    .eq("requester_id", b)
    .eq("addressee_id", a)
    .maybeSingle();
  if (theirs.error) throw new Error(theirs.error.message);
  return {
    mine: (mine.data as FriendshipRow | null) ?? null,
    theirs: (theirs.data as FriendshipRow | null) ?? null,
  };
}

export interface FriendRequestResult {
  status: FriendshipStatus;
  friendshipId: string;
}

/**
 * Invia una richiesta di amicizia. Se l'altro utente ti aveva già chiesto
 * l'amicizia (pending inverso), la accetta direttamente.
 */
export async function sendFriendRequest(
  targetId: string
): Promise<FriendRequestResult> {
  const { supabase, userId } = await requireUserId();
  if (targetId === userId) throw new Error("SELF");

  const { mine, theirs } = await findPair(supabase, userId, targetId);

  if (mine && mine.status === "accepted") {
    return { status: "accepted", friendshipId: mine.id };
  }
  if (theirs && theirs.status === "accepted") {
    return { status: "accepted", friendshipId: theirs.id };
  }
  // Richiesta incrociata: accetto la sua (sono io il destinatario).
  if (theirs && theirs.status === "pending") {
    const accepted = await supabase
      .from("friendships")
      .update({ status: "accepted" })
      .eq("id", theirs.id)
      .select("id, requester_id, addressee_id, status")
      .maybeSingle();
    if (accepted.error) throw new Error(accepted.error.message);
    touchScambi();
    return { status: "accepted", friendshipId: theirs.id };
  }
  if (mine && mine.status === "pending") {
    return { status: "pending", friendshipId: mine.id };
  }
  // Rifiuti precedenti: si riparte da una nuova richiesta.
  if (mine) {
    const gone = await supabase.from("friendships").delete().eq("id", mine.id);
    if (gone.error) throw new Error(gone.error.message);
  }
  if (theirs) {
    const gone = await supabase
      .from("friendships")
      .delete()
      .eq("id", theirs.id);
    if (gone.error) throw new Error(gone.error.message);
  }

  const created = await supabase
    .from("friendships")
    .insert({ requester_id: userId, addressee_id: targetId, status: "pending" })
    .select("id, requester_id, addressee_id, status")
    .maybeSingle();
  if (created.error) throw new Error(created.error.message);
  if (!created.data) throw new Error("FRIENDSHIP_CREATE_FAILED");
  touchScambi();
  return { status: "pending", friendshipId: created.data.id };
}

/**
 * Risponde a una richiesta ricevuta (solo il destinatario può farlo).
 * accept=false → rifiuta; la riga resta come "declined".
 */
export async function respondFriendRequest(
  friendshipId: string,
  accept: boolean
): Promise<FriendRequestResult> {
  const { supabase, userId } = await requireUserId();
  const { data, error } = await supabase
    .from("friendships")
    .select("id, requester_id, addressee_id, status")
    .eq("id", friendshipId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("NOT_FOUND");
  const row = toFriendship(data);
  if (row.addresseeId !== userId) throw new Error("FORBIDDEN");
  if (row.status !== "pending") {
    return { status: row.status, friendshipId: row.id };
  }
  const updated = await supabase
    .from("friendships")
    .update({ status: accept ? "accepted" : "declined" })
    .eq("id", friendshipId);
  if (updated.error) throw new Error(updated.error.message);
  touchScambi();
  return {
    status: accept ? "accepted" : "declined",
    friendshipId,
  };
}

/**
 * Rimuove un'amicizia, annulla una richiesta inviata o archivia un rifiuto.
 * Richiede di essere parte della relazione.
 */
export async function removeFriend(friendshipId: string): Promise<void> {
  const { supabase, userId } = await requireUserId();
  const { data, error } = await supabase
    .from("friendships")
    .select("id, requester_id, addressee_id, status")
    .eq("id", friendshipId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return;
  const row = toFriendship(data);
  if (row.requesterId !== userId && row.addresseeId !== userId) {
    throw new Error("FORBIDDEN");
  }
  const removed = await supabase
    .from("friendships")
    .delete()
    .eq("id", friendshipId);
  if (removed.error) throw new Error(removed.error.message);
  touchScambi();
}

function clampOfferQty(qty: number): number {
  if (!Number.isFinite(qty)) return 1;
  return Math.max(1, Math.min(COLLECTION_LIMITS.MAX, Math.floor(qty)));
}

export interface TradeOfferInput {
  coinId: string;
  quantity?: number;
  notes?: string | null;
}

/**
 * Mette una moneta posseduta a disposizione per gli scambi.
 * Richiede di possederla davvero (quantity >= 1 in collezione).
 */
export async function addTradeOffer(input: TradeOfferInput): Promise<string> {
  const { supabase, userId } = await requireUserId();
  const qty = clampOfferQty(input.quantity ?? 1);
  const notes =
    typeof input.notes === "string" && input.notes.trim()
      ? input.notes.trim().slice(0, COLLECTION_LIMITS.MAX_NOTES_LENGTH)
      : null;

  const owned = await supabase
    .from("user_collection")
    .select("quantity, grade")
    .eq("user_id", userId)
    .eq("coin_id", input.coinId)
    .maybeSingle();
  if (owned.error) throw new Error(owned.error.message);
  if (!owned.data || (owned.data.quantity ?? 0) <= 0) {
    throw new Error("NOT_OWNED");
  }
  const grade = isGrade(owned.data.grade) ? owned.data.grade : null;

  // Upsert manuale (l'indice unico usa coalesce(year,-1): onConflict su
  // sole colonne non combacerebbe e Postgres risponderebbe 42P10).
  const existing = await supabase
    .from("trade_offers")
    .select("id")
    .eq("user_id", userId)
    .eq("coin_id", input.coinId)
    .is("year", null)
    .maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  if (existing.data) {
    const patch: { quantity: number; grade: string | null; notes?: string | null } = {
      quantity: qty,
      grade,
    };
    if (input.notes !== undefined) patch.notes = notes;
    const updated = await supabase
      .from("trade_offers")
      .update(patch)
      .eq("id", existing.data.id);
    if (updated.error) throw new Error(updated.error.message);
    touchScambi();
    return existing.data.id;
  }

  const created = await supabase
    .from("trade_offers")
    .insert({
      user_id: userId,
      coin_id: input.coinId,
      year: null,
      quantity: qty,
      grade,
      notes,
    })
    .select("id")
    .maybeSingle();
  if (created.error) throw new Error(created.error.message);
  if (!created.data) throw new Error("OFFER_CREATE_FAILED");
  touchScambi();
  return created.data.id;
}

/** Ritira una propria offerta di scambio. */
export async function removeTradeOffer(offerId: string): Promise<void> {
  const { supabase, userId } = await requireUserId();
  const removed = await supabase
    .from("trade_offers")
    .delete()
    .eq("id", offerId)
    .eq("user_id", userId);
  if (removed.error) throw new Error(removed.error.message);
  touchScambi();
}
