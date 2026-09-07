"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";
import type { CatalogCoin } from "@/lib/catalog";
import { decrementCoin, incrementCoin } from "@/app/actions/collection";
import { COLLECTION_LIMITS, type CollectionMap } from "@/lib/types";

interface Props {
  coins: CatalogCoin[];
  initialCollection: CollectionMap;
  isGuest: boolean;
}

interface OptimisticUpdate {
  id: string;
  qty: number;
}

function applyOptimistic(
  state: CollectionMap,
  update: OptimisticUpdate
): CollectionMap {
  const next: CollectionMap = { ...state };
  if (update.qty <= 0) delete next[update.id];
  else next[update.id] = update.qty;
  return next;
}

function clampQty(qty: number): number {
  return Math.max(
    COLLECTION_LIMITS.MIN,
    Math.min(COLLECTION_LIMITS.MAX, qty)
  );
}

export default function CoinGrid({ coins, initialCollection, isGuest }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [optimistic, addOptimistic] = useOptimistic<
    CollectionMap,
    OptimisticUpdate
  >(initialCollection, applyOptimistic);

  const handleGuest = (): void => {
    // Reindirizzamento al blocco di login: ancora #login-hint se presente,
    // altrimenti navigazione a /login.
    const hint = document.getElementById("login-hint");
    if (hint) {
      hint.scrollIntoView({ behavior: "smooth", block: "center" });
    } else {
      router.push("/login");
    }
  };

  const change = (coin: CatalogCoin, delta: 1 | -1): void => {
    if (isGuest) {
      handleGuest();
      return;
    }
    const current = optimistic[coin.id] ?? 0;
    const next = clampQty(current + delta);
    if (next === current) return;
    setError(null);

    // Feedback immediato: l'update ottimistico vive dentro la transition.
    // Se la Server Action fallisce, `useOptimistic` effettua il rollback
    // automatico allo stato base (`initialCollection` dal Server Component);
    // mostriamo comunque un messaggio di errore non bloccante.
    startTransition(async () => {
      addOptimistic({ id: coin.id, qty: next });
      try {
        if (delta > 0) await incrementCoin(coin.id);
        else await decrementCoin(coin.id);
      } catch (e) {
        setError(
          e instanceof Error && e.message !== "UNAUTHENTICATED"
            ? `Aggiornamento non riuscito per ${coin.faceValue} ${coin.year}. Riprova.`
            : "Sessione scaduta: accedi di nuovo per salvare la collezione."
        );
      }
    });
  };

  return (
    <div aria-busy={isPending}>
      {error && (
        <p
          role="alert"
          className="mb-3 rounded-xl bg-red-50 p-3 text-center text-xs font-medium text-red-700 dark:bg-red-950 dark:text-red-200"
        >
          {error}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
        {coins.map((coin) => {
          const qty = optimistic[coin.id] ?? 0;
          const owned = qty > 0;
          return (
            <article
              key={coin.id}
              className={`group relative flex flex-col overflow-hidden rounded-2xl border bg-white shadow-sm transition-all hover:shadow-md dark:bg-zinc-900 ${
                owned
                  ? "border-emerald-300 ring-1 ring-emerald-200 dark:border-emerald-800"
                  : "border-zinc-200 dark:border-zinc-800"
              }`}
            >
              <div className="relative aspect-square bg-gradient-to-br from-zinc-50 to-zinc-100 p-4 dark:from-zinc-800 dark:to-zinc-900">
                <Image
                  src={coin.url}
                  alt={`${coin.faceValue} ${coin.countryName} ${coin.year}`}
                  fill
                  sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
                  className={`object-contain p-2 transition-all duration-300 ${
                    owned
                      ? "opacity-100 saturate-100"
                      : "opacity-50 saturate-0 group-hover:opacity-75"
                  }`}
                  loading="lazy"
                />
                {owned && (
                  <span className="absolute right-2 top-2 rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-bold text-white shadow">
                    x{qty}
                  </span>
                )}
                {coin.isCommemorative && (
                  <span className="absolute left-2 top-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900 dark:bg-amber-900/60 dark:text-amber-100">
                    2 € comm.
                  </span>
                )}
              </div>

              <div className="flex flex-1 flex-col gap-1 p-3">
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-50">
                  {coin.faceValue} · {coin.year}
                </h3>
                <p className="line-clamp-2 min-h-8 text-xs leading-4 text-zinc-500 dark:text-zinc-400">
                  {coin.description}
                </p>
                <p className="text-[11px] text-zinc-400">
                  {coin.mintage ? `Tiratura: ${coin.mintage}` : "Tiratura: n/d"}
                </p>

                <div className="mt-2 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => change(coin, -1)}
                    disabled={qty === 0 || isPending}
                    aria-label={`Rimuovi ${coin.id}`}
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-zinc-300 text-lg font-bold text-zinc-600 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-30 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    −
                  </button>
                  <span
                    className={`text-sm font-semibold tabular-nums ${
                      owned
                        ? "text-emerald-700 dark:text-emerald-300"
                        : "text-zinc-400"
                    }`}
                    aria-live="polite"
                  >
                    {owned ? `${qty} pz` : "Non posseduta"}
                  </span>
                  <button
                    type="button"
                    onClick={() => change(coin, 1)}
                    disabled={qty >= COLLECTION_LIMITS.MAX || isPending}
                    aria-label={`Aggiungi ${coin.id}`}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-900 text-lg font-bold text-white transition hover:bg-zinc-700 disabled:opacity-30 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
                  >
                    +
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
      {coins.length === 0 && (
        <p className="py-16 text-center text-sm text-zinc-500">
          Nessuna moneta trovata con questi filtri.
        </p>
      )}
    </div>
  );
}
