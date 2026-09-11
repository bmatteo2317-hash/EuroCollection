import { sql } from "@/lib/db";

/**
 * Tipi del modulo sociale (amicizie + scambi).
 * Tabelle Neon: `profiles`, `friendships`, `trade_offers`
 * (vedi neon/schema.sql).
 */

export type FriendshipStatus = "pending" | "accepted" | "declined";

export interface Friendship {
  id: string;
  requesterId: string;
  addresseeId: string;
  status: FriendshipStatus;
}

export interface SocialUser {
  id: string;
  displayName: string;
}

export interface TradeOffer {
  id: string;
  userId: string;
  coinId: string;
  year: number | null;
  quantity: number;
  grade: string | null;
  notes: string | null;
}

interface FriendshipRow {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: string;
}

interface OfferRow {
  id: string;
  user_id: string;
  coin_id: string;
  year: number | null;
  quantity: number;
  grade: string | null;
  notes: string | null;
}

export function toFriendship(row: FriendshipRow): Friendship {
  const status =
    row.status === "accepted" || row.status === "declined"
      ? row.status
      : "pending";
  return {
    id: row.id,
    requesterId: row.requester_id,
    addresseeId: row.addressee_id,
    status,
  };
}

export function toTradeOffer(row: OfferRow): TradeOffer {
  return {
    id: row.id,
    userId: row.user_id,
    coinId: row.coin_id,
    year: row.year,
    quantity: row.quantity,
    grade: row.grade,
    notes: row.notes?.trim() ? row.notes : null,
  };
}

export type TradeRequestStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "cancelled"
  | "completed";

export interface TradeRequest {
  id: string;
  proposerId: string;
  addresseeId: string;
  offeredOfferId: string | null;
  requestedOfferId: string | null;
  offeredCoinId: string;
  offeredYear: number | null;
  requestedCoinId: string;
  requestedYear: number | null;
  acceptedOfferedYear: number | null;
  acceptedRequestedYear: number | null;
  message: string | null;
  status: TradeRequestStatus;
}

interface TradeRequestRow {
  id: string;
  proposer_id: string;
  addressee_id: string;
  offered_offer_id: string | null;
  requested_offer_id: string | null;
  offered_coin_id: string;
  offered_year: number | null;
  requested_coin_id: string;
  requested_year: number | null;
  accepted_offered_year: number | null;
  accepted_requested_year: number | null;
  message: string | null;
  status: string;
}

export function toTradeRequest(row: TradeRequestRow): TradeRequest {
  const status =
    row.status === "accepted" ||
    row.status === "declined" ||
    row.status === "cancelled" ||
    row.status === "completed"
      ? row.status
      : "pending";
  return {
    id: row.id,
    proposerId: row.proposer_id,
    addresseeId: row.addressee_id,
    offeredOfferId: row.offered_offer_id,
    requestedOfferId: row.requested_offer_id,
    offeredCoinId: row.offered_coin_id,
    offeredYear: row.offered_year,
    requestedCoinId: row.requested_coin_id,
    requestedYear: row.requested_year,
    acceptedOfferedYear: row.accepted_offered_year,
    acceptedRequestedYear: row.accepted_requested_year,
    message: row.message?.trim() ? row.message : null,
    status,
  };
}

/** L'altro utente di un'amicizia rispetto a `meId`. */
export function otherSide(f: Friendship, meId: string): string {
  return f.requesterId === meId ? f.addresseeId : f.requesterId;
}

/**
 * Crea il profilo pubblico se manca (il trigger on_user_created lo crea
 * già alla registrazione: questo è solo un fallback per utenti esistenti).
 */
export async function ensureProfile(
  userId: string,
  email: string | null
): Promise<void> {
  const found = (await sql()`
    SELECT id FROM public.profiles WHERE id = ${userId} LIMIT 1
  `) as unknown as { id: string }[];
  if (found.length > 0) return;
  const base =
    (email?.split("@")[0] ?? "collezionista").slice(0, 40) || "collezionista";
  await sql()`INSERT INTO public.profiles (id, display_name) VALUES (${userId}, ${base}) ON CONFLICT (id) DO NOTHING`;
}
