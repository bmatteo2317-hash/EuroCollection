"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { requireSessionUser } from "@/lib/auth";
import { toFriendship, type FriendshipStatus } from "@/lib/social";
import { COLLECTION_LIMITS, isGrade } from "@/lib/types";

async function requireUserId(): Promise<string> {
  const user = await requireSessionUser();
  return user.id;
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
  a: string,
  b: string
): Promise<{ mine: FriendshipRow | null; theirs: FriendshipRow | null }> {
  const mineRows = (await sql()`
    SELECT id, requester_id, addressee_id, status FROM public.friendships
    WHERE requester_id = ${a} AND addressee_id = ${b} LIMIT 1
  `) as unknown as FriendshipRow[];
  const theirsRows = (await sql()`
    SELECT id, requester_id, addressee_id, status FROM public.friendships
    WHERE requester_id = ${b} AND addressee_id = ${a} LIMIT 1
  `) as unknown as FriendshipRow[];
  return {
    mine: mineRows[0] ?? null,
    theirs: theirsRows[0] ?? null,
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
  const userId = await requireUserId();
  if (targetId === userId) throw new Error("SELF");

  const { mine, theirs } = await findPair(userId, targetId);

  if (mine && mine.status === "accepted") {
    return { status: "accepted", friendshipId: mine.id };
  }
  if (theirs && theirs.status === "accepted") {
    return { status: "accepted", friendshipId: theirs.id };
  }
  // Richiesta incrociata: accetto la sua (sono io il destinatario).
  if (theirs && theirs.status === "pending") {
    await sql()`UPDATE public.friendships SET status = 'accepted', updated_at = now() WHERE id = ${theirs.id}`;
    touchScambi();
    return { status: "accepted", friendshipId: theirs.id };
  }
  if (mine && mine.status === "pending") {
    return { status: "pending", friendshipId: mine.id };
  }
  // Rifiuti precedenti: si riparte da una nuova richiesta.
  if (mine) {
    await sql()`DELETE FROM public.friendships WHERE id = ${mine.id}`;
  }
  if (theirs) {
    await sql()`DELETE FROM public.friendships WHERE id = ${theirs.id}`;
  }

  const created = (await sql()`
    INSERT INTO public.friendships (requester_id, addressee_id, status)
    VALUES (${userId}, ${targetId}, 'pending')
    RETURNING id
  `) as unknown as { id: string }[];
  if (!created[0]) throw new Error("FRIENDSHIP_CREATE_FAILED");
  touchScambi();
  return { status: "pending", friendshipId: created[0].id };
}

/**
 * Risponde a una richiesta ricevuta (solo il destinatario può farlo).
 * accept=false → rifiuta; la riga resta come "declined".
 */
export async function respondFriendRequest(
  friendshipId: string,
  accept: boolean
): Promise<FriendRequestResult> {
  const userId = await requireUserId();
  const rows = (await sql()`
    SELECT id, requester_id, addressee_id, status FROM public.friendships
    WHERE id = ${friendshipId} LIMIT 1
  `) as unknown as FriendshipRow[];
  const data = rows[0];
  if (!data) throw new Error("NOT_FOUND");
  const row = toFriendship(data);
  if (row.addresseeId !== userId) throw new Error("FORBIDDEN");
  if (row.status !== "pending") {
    return { status: row.status, friendshipId: row.id };
  }
  await sql()`UPDATE public.friendships SET status = ${accept ? "accepted" : "declined"}, updated_at = now() WHERE id = ${friendshipId}`;
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
  const userId = await requireUserId();
  const rows = (await sql()`
    SELECT id, requester_id, addressee_id, status FROM public.friendships
    WHERE id = ${friendshipId} LIMIT 1
  `) as unknown as FriendshipRow[];
  const data = rows[0];
  if (!data) return;
  const row = toFriendship(data);
  if (row.requesterId !== userId && row.addresseeId !== userId) {
    throw new Error("FORBIDDEN");
  }
  await sql()`DELETE FROM public.friendships WHERE id = ${friendshipId}`;
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
  const userId = await requireUserId();
  const qty = clampOfferQty(input.quantity ?? 1);
  const notes =
    typeof input.notes === "string" && input.notes.trim()
      ? input.notes.trim().slice(0, COLLECTION_LIMITS.MAX_NOTES_LENGTH)
      : null;

  const owned = (await sql()`
    SELECT quantity, grade FROM public.user_collection
    WHERE user_id = ${userId} AND coin_id = ${input.coinId} LIMIT 1
  `) as unknown as { quantity: number; grade: string | null }[];
  if (!owned[0] || (owned[0].quantity ?? 0) <= 0) {
    throw new Error("NOT_OWNED");
  }
  const grade = isGrade(owned[0].grade) ? owned[0].grade : null;

  // Un'offerta per (utente, moneta, anno NULL): cerca l'esistente.
  const existing = (await sql()`
    SELECT id FROM public.trade_offers
    WHERE user_id = ${userId} AND coin_id = ${input.coinId} AND year IS NULL LIMIT 1
  `) as unknown as { id: string }[];
  if (existing[0]) {
    if (input.notes !== undefined) {
      await sql()`UPDATE public.trade_offers SET quantity = ${qty}, grade = ${grade}, notes = ${notes}, updated_at = now() WHERE id = ${existing[0].id}`;
    } else {
      await sql()`UPDATE public.trade_offers SET quantity = ${qty}, grade = ${grade}, updated_at = now() WHERE id = ${existing[0].id}`;
    }
    touchScambi();
    return existing[0].id;
  }

  const created = (await sql()`
    INSERT INTO public.trade_offers (user_id, coin_id, year, quantity, grade, notes)
    VALUES (${userId}, ${input.coinId}, NULL, ${qty}, ${grade}, ${notes})
    RETURNING id
  `) as unknown as { id: string }[];
  if (!created[0]) throw new Error("OFFER_CREATE_FAILED");
  touchScambi();
  return created[0].id;
}

/** Ritira una propria offerta di scambio. */
export async function removeTradeOffer(offerId: string): Promise<void> {
  const userId = await requireUserId();
  await sql()`DELETE FROM public.trade_offers WHERE id = ${offerId} AND user_id = ${userId}`;
  touchScambi();
}

export interface ProposeTradeInput {
  addresseeId: string;
  /** Una tua offerta (ciò che dai). */
  myOfferId: string;
  /** Un'offerta dell'amico (ciò che chiedi). */
  theirOfferId: string;
  message?: string | null;
}

/**
 * Propone uno scambio a un amico: la tua offerta per una sua offerta
 * (1 pezzo per parte). Snapshot moneta su richiesta anche se le offerte
 * vengono ritirate.
 */
export async function proposeTradeRequest(
  input: ProposeTradeInput
): Promise<string> {
  const userId = await requireUserId();
  if (input.addresseeId === userId) throw new Error("SELF");
  const message =
    typeof input.message === "string" && input.message.trim()
      ? input.message.trim().slice(0, COLLECTION_LIMITS.MAX_NOTES_LENGTH)
      : null;

  const mine = (await sql()`
    SELECT id, user_id, coin_id, year, quantity FROM public.trade_offers
    WHERE id = ${input.myOfferId} AND user_id = ${userId} LIMIT 1
  `) as unknown as { id: string; user_id: string; coin_id: string; year: number | null; quantity: number }[];
  if (!mine[0] || (mine[0].quantity ?? 0) < 1) {
    throw new Error("OFFER_UNAVAILABLE");
  }

  const theirs = (await sql()`
    SELECT id, user_id, coin_id, year, quantity FROM public.trade_offers
    WHERE id = ${input.theirOfferId} AND user_id = ${input.addresseeId} LIMIT 1
  `) as unknown as { id: string; user_id: string; coin_id: string; year: number | null; quantity: number }[];
  if (!theirs[0] || (theirs[0].quantity ?? 0) < 1) {
    throw new Error("OFFER_UNAVAILABLE");
  }

  const created = (await sql()`
    INSERT INTO public.trade_requests
      (proposer_id, addressee_id, offered_offer_id, requested_offer_id, offered_coin_id, offered_year, requested_coin_id, requested_year, message, status)
    VALUES (${userId}, ${input.addresseeId}, ${mine[0].id}, ${theirs[0].id}, ${mine[0].coin_id}, ${mine[0].year}, ${theirs[0].coin_id}, ${theirs[0].year}, ${message}, 'pending')
    RETURNING id
  `) as unknown as { id: string }[];
  if (!created[0]) throw new Error("REQUEST_CREATE_FAILED");
  touchScambi();
  return created[0].id;
}

/**
 * Risponde a una richiesta di scambio ricevuta.
 * accept=true → solo accordo (NESSUN movimento di monete: lo scambio
 * fisico si conferma dopo con completeTradeRequest).
 */
export async function respondTradeRequest(
  requestId: string,
  accept: boolean
): Promise<void> {
  const userId = await requireUserId();
  const rows = (await sql()`
    SELECT id, proposer_id, addressee_id, status FROM public.trade_requests
    WHERE id = ${requestId} LIMIT 1
  `) as unknown as { id: string; proposer_id: string; addressee_id: string; status: string }[];
  const data = rows[0];
  if (!data) throw new Error("NOT_FOUND");
  if (data.addressee_id !== userId) throw new Error("FORBIDDEN");
  if (data.status !== "pending") throw new Error("STATE");

  if (accept) {
    await sql()`SELECT public.accept_trade_request(${requestId}, ${userId})`;
  } else {
    await sql()`UPDATE public.trade_requests SET status = 'declined', updated_at = now() WHERE id = ${requestId}`;
  }
  touchScambi();
}

/**
 * Conferma l'avvenuto scambio fisico (una delle due parti, solo se c'è
 * già l'accordo). Sposta 1 pezzo per lato e chiude come completed.
 * Fallisce con OFFER_UNAVAILABLE se un'offerta non esiste più.
 */
export async function completeTradeRequest(requestId: string): Promise<void> {
  const userId = await requireUserId();
  const rows = (await sql()`
    SELECT id, proposer_id, addressee_id, status FROM public.trade_requests
    WHERE id = ${requestId} LIMIT 1
  `) as unknown as { id: string; proposer_id: string; addressee_id: string; status: string }[];
  const data = rows[0];
  if (!data) throw new Error("NOT_FOUND");
  if (data.proposer_id !== userId && data.addressee_id !== userId) {
    throw new Error("FORBIDDEN");
  }
  if (data.status !== "accepted") throw new Error("STATE");

  await sql()`SELECT public.complete_trade_request(${requestId}, ${userId})`;

  touchScambi();
  try {
    revalidatePath("/");
    revalidatePath("/collezione");
  } catch (e) {
    console.warn("[social] revalidate collezione fallita:", e);
  }
}

/**
 * Annulla una richiesta inviata e ancora in attesa, oppure un accordo
 * non ancora completato (una delle due parti).
 */
export async function cancelTradeRequest(requestId: string): Promise<void> {
  const userId = await requireUserId();
  const rows = (await sql()`
    SELECT id, proposer_id, addressee_id, status FROM public.trade_requests
    WHERE id = ${requestId} LIMIT 1
  `) as unknown as { id: string; proposer_id: string; addressee_id: string; status: string }[];
  const data = rows[0];
  if (!data) return;
  if (data.status !== "pending" && data.status !== "accepted") {
    throw new Error("STATE");
  }
  if (data.status === "pending" && data.proposer_id !== userId) {
    throw new Error("FORBIDDEN");
  }
  if (
    data.status === "accepted" &&
    data.proposer_id !== userId &&
    data.addressee_id !== userId
  ) {
    throw new Error("FORBIDDEN");
  }
  await sql()`UPDATE public.trade_requests SET status = 'cancelled', updated_at = now() WHERE id = ${requestId}`;
  touchScambi();
}

/** Elimina da cronologia una richiesta chiusa (non pending). */
export async function deleteTradeRequest(requestId: string): Promise<void> {
  const userId = await requireUserId();
  const rows = (await sql()`
    SELECT id, proposer_id, addressee_id, status FROM public.trade_requests
    WHERE id = ${requestId} LIMIT 1
  `) as unknown as { id: string; proposer_id: string; addressee_id: string; status: string }[];
  const data = rows[0];
  if (!data) return;
  if (data.proposer_id !== userId && data.addressee_id !== userId) {
    throw new Error("FORBIDDEN");
  }
  if (data.status === "pending") throw new Error("STATE");
  await sql()`DELETE FROM public.trade_requests WHERE id = ${requestId}`;
  touchScambi();
}
