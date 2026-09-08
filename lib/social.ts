import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Tipi del modulo sociale (amicizie + scambi).
 * Tabelle Supabase: `profiles`, `friendships`, `trade_offers`
 * (vedi supabase/migration_005_social_trades.sql).
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

/** L'altro utente di un'amicizia rispetto a `meId`. */
export function otherSide(f: Friendship, meId: string): string {
  return f.requesterId === meId ? f.addresseeId : f.requesterId;
}

/**
 * Crea il profilo pubblico se manca (utenti registrati prima della
 * migration 005 o trigger non scattato). Nome = parte prima della @.
 */
export async function ensureProfile(
  supabase: SupabaseClient,
  userId: string,
  email: string | null
): Promise<void> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (data) return;
  const base =
    (email?.split("@")[0] ?? "collezionista").slice(0, 40) || "collezionista";
  const created = await supabase
    .from("profiles")
    .insert({ id: userId, display_name: base });
  if (created.error) throw new Error(created.error.message);
}
