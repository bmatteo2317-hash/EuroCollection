import { redirect } from "next/navigation";
import Link from "next/link";
import { getCatalog } from "@/lib/catalog";
import { createClient } from "@/lib/supabase/server";
import { fetchOwnership, isMissingTableError } from "@/lib/collection";
import {
  ensureProfile,
  otherSide,
  toFriendship,
  toTradeOffer,
  type Friendship,
  type SocialUser,
  type TradeOffer,
} from "@/lib/social";
import SocialBoard, {
  type FriendOffersGroup,
} from "@/components/SocialBoard";

// Pagina privata: elenco collezionisti, amicizie e scambi.
export const dynamic = "force-dynamic";

const MISSING_TABLES_MESSAGE =
  "Manca la migration sociale su Supabase: esegui supabase/migration_005_social_trades.sql nel SQL Editor.";

export default async function ScambiPage() {
  let userId: string | null = null;
  let userEmail: string | null = null;
  let supabase: Awaited<ReturnType<typeof createClient>> | null = null;
  try {
    supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id ?? null;
    userEmail = user?.email ?? null;
  } catch {
    userId = null;
  }
  if (!userId || !supabase) redirect("/login");

  let users: SocialUser[] = [];
  let friendships: Friendship[] = [];
  let myOffers: TradeOffer[] = [];
  let groups: FriendOffersGroup[] = [];
  let ownedOptions: { id: string; label: string }[] = [];
  let coinLabels: Record<string, string> = {};
  let missingTables = false;

  try {
    try {
      await ensureProfile(supabase, userId, userEmail);
    } catch (e) {
      console.warn("[scambi] ensureProfile fallito:", e);
    }

    const profRes = await supabase
      .from("profiles")
      .select("id, display_name")
      .neq("id", userId)
      .order("display_name")
      .limit(50);
    if (profRes.error) throw profRes.error;
    const nameById = new Map<string, string>();
    for (const row of profRes.data ?? []) {
      users.push({ id: row.id, displayName: row.display_name });
      nameById.set(row.id, row.display_name);
    }

    const frRes = await supabase
      .from("friendships")
      .select("id, requester_id, addressee_id, status")
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);
    if (frRes.error) throw frRes.error;
    friendships = (frRes.data ?? []).map(toFriendship);

    const offRes = await supabase
      .from("trade_offers")
      .select("id, user_id, coin_id, year, quantity, grade, notes")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (offRes.error) throw offRes.error;
    myOffers = (offRes.data ?? []).map(toTradeOffer);

    // Amici accettati + loro offerte (visibili grazie alla policy "amici").
    const friendIds = [
      ...new Set(
        friendships
          .filter((f) => f.status === "accepted")
          .map((f) => otherSide(f, userId as string))
      ),
    ];
    const missingNames = friendIds.filter((id) => !nameById.has(id));
    if (missingNames.length > 0) {
      const namesRes = await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", missingNames);
      if (!namesRes.error) {
        for (const row of namesRes.data ?? []) {
          nameById.set(row.id, row.display_name);
        }
      }
    }
    if (friendIds.length > 0) {
      const foRes = await supabase
        .from("trade_offers")
        .select("id, user_id, coin_id, year, quantity, grade, notes")
        .in("user_id", friendIds)
        .order("created_at", { ascending: false });
      if (foRes.error) throw foRes.error;
      const byFriend = new Map<string, TradeOffer[]>();
      for (const row of foRes.data ?? []) {
        const offer = toTradeOffer(row);
        const list = byFriend.get(offer.userId) ?? [];
        list.push(offer);
        byFriend.set(offer.userId, list);
      }
      groups = friendIds.map((fid) => ({
        friendId: fid,
        friendName: nameById.get(fid) ?? "Collezionista",
        offers: byFriend.get(fid) ?? [],
      }));
    }

    // Etichette leggibili per monete (offerte + possedute).
    const byId = new Map(getCatalog().map((c) => [c.id, c]));
    const labelFor = (coinId: string): string => {
      const coin = byId.get(coinId);
      if (!coin) return coinId;
      return `${coin.faceValue} · ${coin.countryName} · ${coin.year}`;
    };
    const referenced = new Set<string>([
      ...myOffers.map((o) => o.coinId),
      ...groups.flatMap((g) => g.offers.map((o) => o.coinId)),
    ]);
    for (const id of referenced) coinLabels[id] = labelFor(id);

    const { quantities } = await fetchOwnership(supabase, userId);
    ownedOptions = Object.keys(quantities)
      .map((id) => ({ id, label: `${labelFor(id)} · x${quantities[id]}` }))
      .sort((a, b) => a.label.localeCompare(b.label, "it"));
    for (const opt of ownedOptions) {
      if (!coinLabels[opt.id]) coinLabels[opt.id] = labelFor(opt.id);
    }
  } catch (e) {
    if (isMissingTableError(e)) {
      missingTables = true;
    } else {
      console.error("[scambi] caricamento fallito:", e);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl font-extrabold">Scambi tra collezionisti</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Trova altri collezionisti, chiedi l&apos;amicizia e guarda le monete
          che i tuoi amici mettono a disposizione.{" "}
          <Link href="/" className="font-semibold text-emerald-700 hover:underline dark:text-emerald-400">
            ← Catalogo
          </Link>
        </p>
      </header>

      {missingTables && (
        <p
          role="alert"
          className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm font-medium text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
        >
          {MISSING_TABLES_MESSAGE}
        </p>
      )}

      <SocialBoard
        meId={userId}
        users={users}
        friendships={friendships}
        myOffers={myOffers}
        groups={groups}
        ownedOptions={ownedOptions}
        coinLabels={coinLabels}
      />
    </div>
  );
}
