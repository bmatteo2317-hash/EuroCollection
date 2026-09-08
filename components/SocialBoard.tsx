"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  addTradeOffer,
  removeFriend,
  removeTradeOffer,
  respondFriendRequest,
  sendFriendRequest,
} from "@/app/actions/social";
import {
  otherSide,
  type Friendship,
  type SocialUser,
  type TradeOffer,
} from "@/lib/social";

export interface FriendOffersGroup {
  friendId: string;
  friendName: string;
  offers: TradeOffer[];
}

interface Props {
  meId: string;
  users: SocialUser[];
  friendships: Friendship[];
  myOffers: TradeOffer[];
  groups: FriendOffersGroup[];
  ownedOptions: { id: string; label: string }[];
  coinLabels: Record<string, string>;
}

type Relation =
  | { kind: "none" }
  | { kind: "pending-out"; friendshipId: string }
  | { kind: "pending-in"; friendshipId: string }
  | { kind: "accepted"; friendshipId: string }
  | { kind: "declined"; friendshipId: string };

function relationOf(friendships: Friendship[], meId: string, userId: string): Relation {
  const rel = friendships.find(
    (f) =>
      (f.requesterId === meId && f.addresseeId === userId) ||
      (f.requesterId === userId && f.addresseeId === meId)
  );
  if (!rel) return { kind: "none" };
  if (rel.status === "accepted") return { kind: "accepted", friendshipId: rel.id };
  if (rel.status === "declined") return { kind: "declined", friendshipId: rel.id };
  return rel.requesterId === meId
    ? { kind: "pending-out", friendshipId: rel.id }
    : { kind: "pending-in", friendshipId: rel.id };
}

function offerLabel(coinLabels: Record<string, string>, coinId: string): string {
  return coinLabels[coinId] ?? coinId;
}

export default function SocialBoard({
  meId,
  users,
  friendships,
  myOffers,
  groups,
  ownedOptions,
  coinLabels,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  // Form nuova offerta
  const [offerCoin, setOfferCoin] = useState<string>(ownedOptions[0]?.id ?? "");
  const [offerQty, setOfferQty] = useState<number>(1);
  const [offerNotes, setOfferNotes] = useState<string>("");

  const run = (fn: () => Promise<unknown>): void => {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        router.refresh();
      } catch (e) {
        setError(
          e instanceof Error ? friendlyError(e.message) : "Operazione fallita."
        );
      }
    });
  };

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = needle
      ? users.filter((u) => u.displayName.toLowerCase().includes(needle))
      : users;
    return list.slice(0, 15);
  }, [users, query]);

  const pendingIn = useMemo(
    () =>
      friendships.filter(
        (f) => f.status === "pending" && f.addresseeId === meId
      ),
    [friendships, meId]
  );

  const submitOffer = (): void => {
    if (!offerCoin) return;
    const qty = Math.max(1, Math.min(99, Math.floor(offerQty) || 1));
    run(() => addTradeOffer({ coinId: offerCoin, quantity: qty, notes: offerNotes }));
    setOfferNotes("");
  };

  return (
    <div className="flex flex-col gap-6" aria-busy={isPending}>
      {error && (
        <p
          role="alert"
          className="rounded-xl bg-red-50 p-3 text-center text-xs font-medium text-red-700 dark:bg-red-950 dark:text-red-200"
        >
          {error}
        </p>
      )}

      {/* ---- Trova collezionisti ---- */}
      <section className="flex flex-col gap-3 rounded-3xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-lg font-bold">Trova collezionisti</h2>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cerca per nome…"
          aria-label="Cerca collezionisti"
          className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
        />
        {filtered.length === 0 ? (
          <p className="text-sm text-zinc-500">
            {users.length === 0
              ? "Nessun altro collezionista registrato per ora."
              : "Nessun nome trovato."}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {filtered.map((u) => {
              const rel = relationOf(friendships, meId, u.id);
              return (
                <li
                  key={u.id}
                  className="flex items-center justify-between gap-2 rounded-2xl bg-zinc-50 px-3 py-2 dark:bg-zinc-800/60"
                >
                  <span className="truncate text-sm font-semibold">
                    {u.displayName}
                    {rel.kind === "accepted" && (
                      <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200">
                        Amici
                      </span>
                    )}
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {rel.kind === "none" || rel.kind === "declined" ? (
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => run(() => sendFriendRequest(u.id))}
                        className="rounded-full bg-zinc-900 px-3 py-1 text-xs font-bold text-white hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
                      >
                        Aggiungi
                      </button>
                    ) : rel.kind === "pending-out" ? (
                      <>
                        <span className="text-[11px] text-zinc-500">In attesa…</span>
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => run(() => removeFriend(rel.friendshipId))}
                          className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-semibold hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800"
                        >
                          Annulla
                        </button>
                      </>
                    ) : rel.kind === "pending-in" ? (
                      <>
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() =>
                            run(() => respondFriendRequest(rel.friendshipId, true))
                          }
                          className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-40"
                        >
                          Accetta
                        </button>
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() =>
                            run(() => respondFriendRequest(rel.friendshipId, false))
                          }
                          className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-semibold hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800"
                        >
                          Rifiuta
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => run(() => removeFriend(rel.friendshipId))}
                        className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-semibold hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800"
                      >
                        Rimuovi
                      </button>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ---- Richieste ricevute ---- */}
      {pendingIn.length > 0 && (
        <section className="flex flex-col gap-3 rounded-3xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-900 dark:bg-amber-950/30">
          <h2 className="text-lg font-bold">
            Richieste ricevute ({pendingIn.length})
          </h2>
          <ul className="flex flex-col gap-2">
            {pendingIn.map((f) => {
              const other = users.find((u) => u.id === otherSide(f, meId));
              return (
                <li
                  key={f.id}
                  className="flex items-center justify-between gap-2 rounded-2xl bg-white px-3 py-2 dark:bg-zinc-900"
                >
                  <span className="text-sm font-semibold">
                    {other?.displayName ?? "Collezionista"} vuole aggiungerti
                  </span>
                  <span className="flex shrink-0 gap-1.5">
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => run(() => respondFriendRequest(f.id, true))}
                      className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-40"
                    >
                      Accetta
                    </button>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => run(() => respondFriendRequest(f.id, false))}
                      className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-semibold hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800"
                    >
                      Rifiuta
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* ---- Amici e loro offerte ---- */}
      <section className="flex flex-col gap-3 rounded-3xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-lg font-bold">
          Amici e monete in scambio ({groups.length})
        </h2>
        {groups.length === 0 ? (
          <p className="text-sm text-zinc-500">
            Nessun amico ancora. Cerca un collezionista qui sopra e invia una
            richiesta: quando accetta vedrai qui le monete che offre.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {groups.map((g) => (
              <div
                key={g.friendId}
                className="rounded-2xl bg-zinc-50 p-3 dark:bg-zinc-800/60"
              >
                <p className="text-sm font-bold">{g.friendName}</p>
                {g.offers.length === 0 ? (
                  <p className="mt-1 text-xs text-zinc-500">
                    Nessuna moneta offerta al momento.
                  </p>
                ) : (
                  <ul className="mt-2 flex flex-col gap-1.5">
                    {g.offers.map((o) => (
                      <li
                        key={o.id}
                        className="flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-xl bg-white px-2.5 py-1.5 text-xs dark:bg-zinc-900"
                      >
                        <strong>{offerLabel(coinLabels, o.coinId)}</strong>
                        <span className="tabular-nums text-emerald-700 dark:text-emerald-300">
                          x{o.quantity}
                        </span>
                        {o.grade && (
                          <span className="rounded-full bg-zinc-900 px-1.5 py-px text-[10px] font-bold text-white dark:bg-zinc-100 dark:text-zinc-900">
                            {o.grade}
                          </span>
                        )}
                        {o.notes && (
                          <span className="italic text-zinc-500">“{o.notes}”</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ---- Le mie offerte ---- */}
      <section className="flex flex-col gap-3 rounded-3xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-lg font-bold">Le mie offerte ({myOffers.length})</h2>
        <p className="text-xs text-zinc-500">
          Solo i tuoi amici vedono questa lista. Puoi offrire solo monete che
          possiedi davvero.
        </p>
        {ownedOptions.length > 0 ? (
          <div className="flex flex-col gap-2 rounded-2xl bg-zinc-50 p-3 dark:bg-zinc-800/60">
            <label className="flex flex-col gap-1 text-xs font-semibold">
              Moneta posseduta
              <select
                value={offerCoin}
                onChange={(e) => setOfferCoin(e.target.value)}
                aria-label="Moneta da offrire"
                className="rounded-xl border border-zinc-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
              >
                {ownedOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex gap-2">
              <label className="flex w-24 flex-col gap-1 text-xs font-semibold">
                Pezzi
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={offerQty}
                  onChange={(e) => setOfferQty(Number(e.target.value))}
                  aria-label="Pezzi offerti"
                  className="rounded-xl border border-zinc-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
                />
              </label>
              <label className="flex flex-1 flex-col gap-1 text-xs font-semibold">
                Nota (facoltativa)
                <input
                  value={offerNotes}
                  onChange={(e) => setOfferNotes(e.target.value.slice(0, 200))}
                  placeholder="Es. FDC, scambio a mano a Roma…"
                  aria-label="Nota offerta"
                  className="rounded-xl border border-zinc-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
                />
              </label>
            </div>
            <button
              type="button"
              disabled={isPending || !offerCoin}
              onClick={submitOffer}
              className="rounded-xl bg-emerald-600 py-1.5 text-sm font-bold text-white hover:bg-emerald-500 disabled:opacity-40"
            >
              {isPending ? "Salvataggio…" : "Metti in scambio"}
            </button>
          </div>
        ) : (
          <p className="text-sm text-zinc-500">
            Non possiedi ancora monete: aggiungine qualcuna dal catalogo prima
            di offrire scambi.
          </p>
        )}
        {myOffers.length > 0 && (
          <ul className="flex flex-col gap-1.5">
            {myOffers.map((o) => (
              <li
                key={o.id}
                className="flex items-center justify-between gap-2 rounded-2xl bg-zinc-50 px-3 py-2 text-xs dark:bg-zinc-800/60"
              >
                <span>
                  <strong>{offerLabel(coinLabels, o.coinId)}</strong>{" "}
                  <span className="tabular-nums text-emerald-700 dark:text-emerald-300">
                    x{o.quantity}
                  </span>
                  {o.notes && (
                    <span className="italic text-zinc-500"> “{o.notes}”</span>
                  )}
                </span>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => run(() => removeTradeOffer(o.id))}
                  className="shrink-0 rounded-full border border-zinc-300 px-3 py-1 font-semibold hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800"
                >
                  Ritira
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function friendlyError(message: string): string {
  if (message === "UNAUTHENTICATED")
    return "Sessione scaduta: accedi di nuovo.";
  if (message === "SELF") return "Non puoi aggiungere te stesso.";
  if (message === "NOT_OWNED")
    return "Puoi offrire solo monete che possiedi davvero.";
  if (message === "NOT_FOUND") return "Elemento non trovato.";
  if (message === "FORBIDDEN") return "Operazione non consentita.";
  return `Operazione fallita. Dettaglio: ${message}`;
}
