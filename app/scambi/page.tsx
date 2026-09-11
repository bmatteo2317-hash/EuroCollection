import { redirect } from "next/navigation";
import Link from "next/link";
import { getCatalog } from "@/lib/catalog";
import { getSessionUser } from "@/lib/auth";
import { sql, isMissingTableError } from "@/lib/db";
import { fetchOwnership } from "@/lib/collection";
import {
  ensureProfile,
  otherSide,
  toFriendship,
  toTradeOffer,
  toTradeRequest,
  type Friendship,
  type SocialUser,
  type TradeOffer,
  type TradeRequest,
} from "@/lib/social";
import SocialBoard, {
  type FriendOffersGroup,
} from "@/components/SocialBoard";

// Pagina privata: elenco collezionisti, amicizie e scambi.
export const dynamic = "force-dynamic";

const MISSING_TABLES_MESSAGE =
  "Manca lo schema sociale su Neon: esegui neon/schema.sql nel SQL Editor di Neon.";

export default async function ScambiPage() {
  let userId: string | null = null;
  let userEmail: string | null = null;
  try {
    const user = await getSessionUser();
    userId = user?.id ?? null;
    userEmail = user?.email ?? null;
  } catch {
    userId = null;
  }
  if (!userId) redirect("/login");
  const meId = userId as string;

  let users: SocialUser[] = [];
  let friendships: Friendship[] = [];
  let myOffers: TradeOffer[] = [];
  let groups: FriendOffersGroup[] = [];
  let requests: TradeRequest[] = [];
  let names: Record<string, string> = {};
  let ownedOptions: { id: string; label: string }[] = [];
  let coinLabels: Record<string, string> = {};
  let missingTables = false;

  try {
    try {
      await ensureProfile(meId, userEmail);
    } catch (e) {
      console.warn("[scambi] ensureProfile fallito:", e);
    }

    const profRows = (await sql()`
      SELECT id, display_name FROM public.profiles
      WHERE id <> ${meId} ORDER BY display_name LIMIT 50
    `) as unknown as { id: string; display_name: string }[];
    const nameById = new Map<string, string>();
    for (const row of profRows ?? []) {
      users.push({ id: row.id, displayName: row.display_name });
      nameById.set(row.id, row.display_name);
    }

    const frRows = (await sql()`
      SELECT id, requester_id, addressee_id, status FROM public.friendships
      WHERE requester_id = ${meId} OR addressee_id = ${meId}
    `) as unknown as { id: string; requester_id: string; addressee_id: string; status: string }[];
    friendships = (frRows ?? []).map(toFriendship);

    const offRows = (await sql()`
      SELECT id, user_id, coin_id, year, quantity, grade, notes FROM public.trade_offers
      WHERE user_id = ${meId} ORDER BY created_at DESC
    `) as unknown as {
      id: string;
      user_id: string;
      coin_id: string;
      year: number | null;
      quantity: number;
      grade: string | null;
      notes: string | null;
    }[];
    myOffers = (offRows ?? []).map(toTradeOffer);

    // Amici accettati + loro offerte.
    const friendIds = [
      ...new Set(
        friendships
          .filter((f) => f.status === "accepted")
          .map((f) => otherSide(f, meId))
      ),
    ];

    // Richieste di scambio dove sono parte (inviate + ricevute).
    const reqRows = (await sql()`
      SELECT id, proposer_id, addressee_id, offered_offer_id, requested_offer_id,
        offered_coin_id, offered_year, requested_coin_id, requested_year,
        accepted_offered_year, accepted_requested_year, message, status
      FROM public.trade_requests
      WHERE proposer_id = ${meId} OR addressee_id = ${meId}
      ORDER BY created_at DESC LIMIT 50
    `) as unknown as {
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
    }[];
    requests = (reqRows ?? []).map(toTradeRequest);

    const counterpartIds = [
      ...new Set(
        requests.map((r) =>
          r.proposerId === meId ? r.addresseeId : r.proposerId
        )
      ),
    ];
    const missingNames = [...new Set([...friendIds, ...counterpartIds])].filter(
      (id) => !nameById.has(id)
    );
    if (missingNames.length > 0) {
      const namesRows = (await sql()`
        SELECT id, display_name FROM public.profiles WHERE id = ANY(${missingNames})
      `) as unknown as { id: string; display_name: string }[];
      for (const row of namesRows ?? []) {
        nameById.set(row.id, row.display_name);
      }
    }
    if (friendIds.length > 0) {
      const foRows = (await sql()`
        SELECT id, user_id, coin_id, year, quantity, grade, notes FROM public.trade_offers
        WHERE user_id = ANY(${friendIds}) ORDER BY created_at DESC
      `) as unknown as {
        id: string;
        user_id: string;
        coin_id: string;
        year: number | null;
        quantity: number;
        grade: string | null;
        notes: string | null;
      }[];
      const byFriend = new Map<string, TradeOffer[]>();
      for (const row of foRows ?? []) {
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
      ...requests.flatMap((r) => [r.offeredCoinId, r.requestedCoinId]),
    ]);
    for (const id of referenced) coinLabels[id] = labelFor(id);

    const { quantities } = await fetchOwnership(meId);
    ownedOptions = Object.keys(quantities)
      .map((id) => ({ id, label: `${labelFor(id)} · x${quantities[id]}` }))
      .sort((a, b) => a.label.localeCompare(b.label, "it"));
    for (const opt of ownedOptions) {
      if (!coinLabels[opt.id]) coinLabels[opt.id] = labelFor(opt.id);
    }

    names = Object.fromEntries(nameById);
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
        meId={meId}
        users={users}
        friendships={friendships}
        myOffers={myOffers}
        groups={groups}
        requests={requests}
        names={names}
        ownedOptions={ownedOptions}
        coinLabels={coinLabels}
      />
    </div>
  );
}
