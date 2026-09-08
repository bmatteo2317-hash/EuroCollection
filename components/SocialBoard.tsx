"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  addTradeOffer,
  cancelTradeRequest,
  deleteTradeRequest,
  proposeTradeRequest,
  removeFriend,
  removeTradeOffer,
  respondFriendRequest,
  respondTradeRequest,
  sendFriendRequest,
} from "@/app/actions/social";
import {
  otherSide,
  type Friendship,
  type SocialUser,
  type TradeOffer,
  type TradeRequest,
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
  /** Richieste di scambio dove sono parte (inviate + ricevute). */
  requests: TradeRequest[];
  /** id utente -> nome visualizzato (amici e controparti). */
  names: Record<string, string>;
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
  requests,
  names,
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

  // Form proposta scambio (aperta sull'offerta dell'amico scelta)
  const [swapFor, setSwapFor] = useState<{ friendId: string; offerId: string } | null>(null);
  const [swapMine, setSwapMine] = useState<string>("");
  const [swapMsg, setSwapMsg] = useState<string>("");

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

  const submitSwap = (): void => {
    if (!swapFor || !swapMine) return;
    run(() =>
      proposeTradeRequest({
        addresseeId: swapFor.friendId,
        myOfferId: swapMine,
        theirOfferId: swapFor.offerId,
        message: swapMsg,
      })
    );
    setSwapFor(null);
    setSwapMsg("");
  };

  const nameOf = (id: string): string => names[id] ?? "Collezionista";

  const pendingReqIn = requests.filter(
    (r) => r.status === "pending" && r.addresseeId === meId
  );
  const pendingReqOut = requests.filter(
    (r) => r.status === "pending" && r.proposerId === meId
  );
  const closedReqs = requests.filter((r) => r.status !== "pending");

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
                      <li key={o.id}>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-xl bg-white px-2.5 py-1.5 text-xs dark:bg-zinc-900">
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
                          <button
                            type="button"
                            disabled={isPending || myOffers.length === 0}
                            onClick={() => {
                              setSwapFor({ friendId: g.friendId, offerId: o.id });
                              setSwapMine((prev) => prev || myOffers[0]?.id || "");
                              setSwapMsg("");
                            }}
                            title={
                              myOffers.length === 0
                                ? "Metti prima una tua moneta in scambio qui sotto"
                                : "Proponi uno scambio per questa moneta"
                            }
                            className="ml-auto shrink-0 rounded-full bg-emerald-600 px-2.5 py-0.5 font-bold text-white hover:bg-emerald-500 disabled:opacity-40"
                          >
                            Scambia
                          </button>
                        </div>
                        {swapFor?.offerId === o.id && (
                          <div className="mt-1.5 flex flex-col gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 p-2.5 dark:border-emerald-900 dark:bg-emerald-950/30">
                            <label className="flex flex-col gap-1 text-[11px] font-semibold">
                              Offri in cambio (una tua offerta)
                              <select
                                value={swapMine}
                                onChange={(e) => setSwapMine(e.target.value)}
                                aria-label="La tua offerta in cambio"
                                className="rounded-lg border border-zinc-300 bg-white px-1.5 py-1 text-xs outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-900"
                              >
                                {myOffers.map((m) => (
                                  <option key={m.id} value={m.id}>
                                    {offerLabel(coinLabels, m.coinId)} · x{m.quantity}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <input
                              value={swapMsg}
                              onChange={(e) => setSwapMsg(e.target.value.slice(0, 200))}
                              placeholder="Messaggio (facoltativo)…"
                              aria-label="Messaggio per lo scambio"
                              className="rounded-lg border border-zinc-300 bg-white px-1.5 py-1 text-xs outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-900"
                            />
                            <div className="flex gap-1.5">
                              <button
                                type="button"
                                disabled={isPending || !swapMine}
                                onClick={submitSwap}
                                className="flex-1 rounded-lg bg-emerald-600 py-1 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-40"
                              >
                                Invia proposta (1 pezzo ↔ 1 pezzo)
                              </button>
                              <button
                                type="button"
                                disabled={isPending}
                                onClick={() => setSwapFor(null)}
                                className="rounded-lg border border-zinc-300 px-2.5 py-1 text-xs font-semibold hover:bg-white disabled:opacity-40 dark:border-zinc-700"
                              >
                                Chiudi
                              </button>
                            </div>
                          </div>
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

      {/* ---- Richieste di scambio ---- */}
      <section className="flex flex-col gap-3 rounded-3xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-lg font-bold">
          Richieste di scambio
          {pendingReqIn.length + pendingReqOut.length > 0 && (
            <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900 dark:bg-amber-900/50 dark:text-amber-100">
              {pendingReqIn.length + pendingReqOut.length} in attesa
            </span>
          )}
        </h2>
        {requests.length === 0 ? (
          <p className="text-sm text-zinc-500">
            Nessuna richiesta. Premi “Scambia” su una moneta di un amico per
            proporre uno scambio 1 pezzo ↔ 1 pezzo: se accetta, le monete si
            spostano da sole nelle collezioni.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {pendingReqIn.length > 0 && (
              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-bold text-amber-700 dark:text-amber-300">
                  Ricevute da valutare ({pendingReqIn.length})
                </h3>
                {pendingReqIn.map((r) => (
                  <RequestCard
                    key={r.id}
                    request={r}
                    direction="in"
                    otherName={nameOf(r.proposerId)}
                    coinLabels={coinLabels}
                    pending={isPending}
                    onAccept={() => run(() => respondTradeRequest(r.id, true))}
                    onDecline={() => run(() => respondTradeRequest(r.id, false))}
                  />
                ))}
              </div>
            )}
            {pendingReqOut.length > 0 && (
              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-bold text-zinc-600 dark:text-zinc-300">
                  Inviate in attesa ({pendingReqOut.length})
                </h3>
                {pendingReqOut.map((r) => (
                  <RequestCard
                    key={r.id}
                    request={r}
                    direction="out"
                    otherName={nameOf(r.addresseeId)}
                    coinLabels={coinLabels}
                    pending={isPending}
                    onCancel={() => run(() => cancelTradeRequest(r.id))}
                  />
                ))}
              </div>
            )}
            {closedReqs.length > 0 && (
              <details className="rounded-2xl bg-zinc-50 p-3 dark:bg-zinc-800/60">
                <summary className="cursor-pointer text-xs font-semibold text-zinc-500">
                  Cronologia ({closedReqs.length})
                </summary>
                <div className="mt-2 flex flex-col gap-2">
                  {closedReqs.map((r) => (
                    <RequestCard
                      key={r.id}
                      request={r}
                      direction={r.proposerId === meId ? "out" : "in"}
                      otherName={nameOf(
                        r.proposerId === meId ? r.addresseeId : r.proposerId
                      )}
                      coinLabels={coinLabels}
                      pending={isPending}
                      onDelete={() => run(() => deleteTradeRequest(r.id))}
                    />
                  ))}
                </div>
              </details>
            )}
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

function statusBadge(status: TradeRequest["status"]): string {
  switch (status) {
    case "accepted":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200";
    case "declined":
      return "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200";
    case "cancelled":
      return "bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300";
    default:
      return "bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-100";
  }
}

function statusLabel(status: TradeRequest["status"]): string {
  switch (status) {
    case "accepted":
      return "Accettata";
    case "declined":
      return "Rifiutata";
    case "cancelled":
      return "Annullata";
    default:
      return "In attesa";
  }
}

/**
 * Card di una richiesta di scambio: "A (tua) ↔ B (sua)".
 * Per le accettate mostra gli anni effettivamente spostati.
 */
function RequestCard({
  request: r,
  direction,
  otherName,
  coinLabels,
  pending,
  onAccept,
  onDecline,
  onCancel,
  onDelete,
}: {
  request: TradeRequest;
  direction: "in" | "out";
  otherName: string;
  coinLabels: Record<string, string>;
  pending: boolean;
  onAccept?: () => void;
  onDecline?: () => void;
  onCancel?: () => void;
  onDelete?: () => void;
}) {
  const label = (coinId: string, year: number | null): string => {
    const base = coinLabels[coinId] ?? coinId;
    return year != null ? `${base} · anno ${year}` : base;
  };
  const offeredYear = r.acceptedOfferedYear ?? r.offeredYear;
  const requestedYear = r.acceptedRequestedYear ?? r.requestedYear;
  const mineFirst = direction === "out";
  const mySide = label(
    mineFirst ? r.offeredCoinId : r.requestedCoinId,
    mineFirst ? offeredYear : requestedYear
  );
  const hisSide = label(
    mineFirst ? r.requestedCoinId : r.offeredCoinId,
    mineFirst ? requestedYear : offeredYear
  );
  return (
    <div className="rounded-2xl bg-zinc-50 p-3 text-xs dark:bg-zinc-800/60">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <strong>{direction === "in" ? otherName : "Tu"}</strong>
        <span className="text-zinc-500">offre</span>
        <strong>{direction === "in" ? hisSide : mySide}</strong>
        <span className="text-zinc-500">per</span>
        <strong>{direction === "in" ? mySide : hisSide}</strong>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${statusBadge(r.status)}`}
        >
          {statusLabel(r.status)}
        </span>
      </p>
      {r.message && (
        <p className="mt-1 italic text-zinc-500">“{r.message}”</p>
      )}
      {r.status === "pending" && (
        <div className="mt-2 flex gap-1.5">
          {direction === "in" ? (
            <>
              <button
                type="button"
                disabled={pending}
                onClick={onAccept}
                className="rounded-full bg-emerald-600 px-3 py-1 font-bold text-white hover:bg-emerald-500 disabled:opacity-40"
              >
                Accetta e scambia
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={onDecline}
                className="rounded-full border border-zinc-300 px-3 py-1 font-semibold hover:bg-white disabled:opacity-40 dark:border-zinc-700"
              >
                Rifiuta
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={pending}
              onClick={onCancel}
              className="rounded-full border border-zinc-300 px-3 py-1 font-semibold hover:bg-white disabled:opacity-40 dark:border-zinc-700"
            >
              Annulla richiesta
            </button>
          )}
        </div>
      )}
      {r.status !== "pending" && onDelete && (
        <button
          type="button"
          disabled={pending}
          onClick={onDelete}
          className="mt-2 rounded-full border border-zinc-300 px-3 py-1 font-semibold text-zinc-500 hover:bg-white disabled:opacity-40 dark:border-zinc-700"
        >
          Elimina dalla cronologia
        </button>
      )}
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
  if (message === "STATE") return "La richiesta non è più in attesa.";
  if (message === "OFFER_UNAVAILABLE")
    return "Un'offerta non è più disponibile: proponi di nuovo lo scambio.";
  return `Operazione fallita. Dettaglio: ${message}`;
}
