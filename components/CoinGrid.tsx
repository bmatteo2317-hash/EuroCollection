"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useMemo, useOptimistic, useState, useTransition } from "react";
import { DENOMINATIONS, type CatalogCoin } from "@/lib/catalog";
import {
  decrementCoin,
  incrementCoin,
  updateCoinDetails,
} from "@/app/actions/collection";
import {
  COLLECTION_LIMITS,
  GRADES,
  type CollectionMap,
  type Grade,
  type Ownership,
  type OwnershipMap,
} from "@/lib/types";

interface Props {
  coins: CatalogCoin[];
  initialCollection: CollectionMap;
  /** Dettagli (grado + note) per le monete possedute; {} per guest. */
  initialDetails?: OwnershipMap;
  isGuest: boolean;
  /** Mostra la barra di ricerca/filtri/ordinamento (default true). */
  showFilters?: boolean;
}

interface OptimisticUpdate {
  id: string;
  qty: number;
}

type KindFilter = "all" | "regular" | "commemorative";
type PossessionFilter = "all" | "owned" | "missing" | "duplicates";
type SortKey = "year-desc" | "year-asc" | "value-desc" | "value-asc";

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

function valueRank(coin: CatalogCoin): number {
  return DENOMINATIONS.indexOf(coin.denomination);
}

export default function CoinGrid({
  coins,
  initialCollection,
  initialDetails = {},
  isGuest,
  showFilters = true,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [optimistic, addOptimistic] = useOptimistic<
    CollectionMap,
    OptimisticUpdate
  >(initialCollection, applyOptimistic);
  const [details, setDetails] = useState<OwnershipMap>(initialDetails);

  // ---- Filtri di ricerca e ordinamento (istantanei, solo client) ----
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<KindFilter>("all");
  const [possession, setPossession] = useState<PossessionFilter>("all");
  const [year, setYear] = useState<string>("all");
  const [sort, setSort] = useState<SortKey>("year-desc");

  const years = useMemo(() => {
    const set = new Set<number>();
    for (const c of coins) set.add(c.year);
    return [...set].sort((a, b) => b - a);
  }, [coins]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = coins.filter((coin) => {
      if (kind === "regular" && coin.isCommemorative) return false;
      if (kind === "commemorative" && !coin.isCommemorative) return false;
      if (year !== "all" && coin.year !== Number(year)) return false;
      const qty = optimistic[coin.id] ?? 0;
      if (possession === "owned" && qty <= 0) return false;
      if (possession === "missing" && qty > 0) return false;
      if (possession === "duplicates" && qty <= 1) return false;
      if (needle) {
        const haystack =
          `${coin.year} ${coin.faceValue} ${coin.description} ${coin.countryName} ${coin.denomination}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
    const sorted = [...filtered];
    switch (sort) {
      case "year-asc":
        sorted.sort((a, b) => a.year - b.year || valueRank(a) - valueRank(b));
        break;
      case "value-desc":
        sorted.sort((a, b) => valueRank(a) - valueRank(b) || b.year - a.year);
        break;
      case "value-asc":
        sorted.sort((a, b) => valueRank(b) - valueRank(a) || b.year - a.year);
        break;
      case "year-desc":
      default:
        sorted.sort((a, b) => b.year - a.year || valueRank(a) - valueRank(b));
        break;
    }
    return sorted;
  }, [coins, query, kind, possession, year, sort, optimistic]);

  const hasActiveFilters =
    query.trim() !== "" ||
    kind !== "all" ||
    possession !== "all" ||
    year !== "all";

  const resetFilters = (): void => {
    setQuery("");
    setKind("all");
    setPossession("all");
    setYear("all");
    setSort("year-desc");
  };

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

  const saveDetails = (
    coin: CatalogCoin,
    grade: Grade | null,
    notes: string
  ): void => {
    if (isGuest) {
      handleGuest();
      return;
    }
    setError(null);
    const previous: Ownership | null = details[coin.id] ?? null;
    startTransition(async () => {
      try {
        const res = await updateCoinDetails(coin.id, { grade, notes });
        if (res.ownership) {
          setDetails((prev) => ({ ...prev, [coin.id]: res.ownership as Ownership }));
        }
      } catch (e) {
        if (previous) setDetails((prev) => ({ ...prev, [coin.id]: previous }));
        setError(
          e instanceof Error && e.message === "NOT_OWNED"
            ? "Premi prima + per possedere la moneta, poi aggiungi grado e note."
            : `Salvataggio dettagli non riuscito per ${coin.faceValue} ${coin.year}. Riprova.`
        );
      }
    });
  };

  const selectClass =
    "rounded-xl border border-zinc-300 bg-white px-2 py-1.5 text-xs font-medium outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900";

  return (
    <div aria-busy={isPending}>
      {showFilters && coins.length > 0 && (
        <div className="mb-4 flex flex-col gap-2 rounded-2xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cerca: anno, parola, valore… (es. 2004, Torino, 50 cent)"
              aria-label="Cerca monete"
              className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-zinc-500 sm:flex-1 dark:border-zinc-700 dark:bg-zinc-900"
            />
            <select
              value={year}
              onChange={(e) => setYear(e.target.value)}
              aria-label="Filtra per anno"
              className={selectClass}
            >
              <option value="all">Tutti gli anni</option>
              {years.map((y) => (
                <option key={y} value={String(y)}>
                  {y}
                </option>
              ))}
            </select>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              aria-label="Ordina monete"
              className={selectClass}
            >
              <option value="year-desc">Anno ↓ recenti prima</option>
              <option value="year-asc">Anno ↑ vecchie prima</option>
              <option value="value-desc">Valore ↓ 2€ prima</option>
              <option value="value-asc">Valore ↑ cent prima</option>
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="mr-1 font-semibold text-zinc-500">Tipo:</span>
            {(
              [
                ["all", "Tutte"],
                ["regular", "Divisionali"],
                ["commemorative", "Commemorativi"],
              ] as [KindFilter, string][]
            ).map(([value, label]) => (
              <FilterChip
                key={value}
                active={kind === value}
                label={label}
                onClick={() => setKind(value)}
              />
            ))}
            <span className="ml-2 mr-1 font-semibold text-zinc-500">
              Possesso:
            </span>
            {(
              [
                ["all", "Tutte"],
                ["owned", "Possedute"],
                ["missing", "Mancanti"],
                ["duplicates", "Doppioni (x2+)"],
              ] as [PossessionFilter, string][]
            ).map(([value, label]) => (
              <FilterChip
                key={value}
                active={possession === value}
                label={label}
                onClick={() => setPossession(value)}
              />
            ))}
            {hasActiveFilters && (
              <button
                type="button"
                onClick={resetFilters}
                className="ml-auto font-semibold text-emerald-700 hover:underline dark:text-emerald-400"
              >
                Azzera filtri
              </button>
            )}
          </div>
          <p className="text-[11px] text-zinc-400" aria-live="polite">
            {visible.length} di {coins.length} monete mostrate
          </p>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-zinc-400">
            <MetalLegend swatch="#b87333" label="Rame · 1, 2, 5 cent" />
            <MetalLegend
              swatch="#c9a227"
              label="Oro nordico · 10, 20, 50 cent"
            />
            <MetalLegend
              swatch="linear-gradient(135deg, #c9a227 50%, #c0c4cc 50%)"
              label="Bimetalliche · 1 €, 2 €"
            />
          </p>
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="mb-3 rounded-xl bg-red-50 p-3 text-center text-xs font-medium text-red-700 dark:bg-red-950 dark:text-red-200"
        >
          {error}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
        {visible.map((coin) => {
          const qty = optimistic[coin.id] ?? 0;
          const owned = qty > 0;
          const ownership = details[coin.id] ?? null;
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
                {owned && ownership?.grade && (
                  <span
                    className="absolute bottom-2 left-2 rounded-full bg-zinc-900 px-2 py-0.5 text-[11px] font-bold text-white dark:bg-zinc-100 dark:text-zinc-900"
                    title={`Conservazione: ${ownership.grade}`}
                  >
                    {ownership.grade}
                  </span>
                )}
              </div>

              <div className="flex flex-1 flex-col gap-1 p-3">
                <h3 className="flex items-center gap-1.5 text-sm font-bold text-zinc-900 dark:text-zinc-50">
                  <span
                    aria-hidden="true"
                    title={`Metallo: ${coin.metal.label}`}
                    style={{ background: coin.metal.swatch }}
                    className="inline-block h-2.5 w-2.5 shrink-0 rounded-full shadow-sm"
                  />
                  {coin.faceValue} · {coin.year}
                </h3>
                <p className="line-clamp-2 min-h-8 text-xs leading-4 text-zinc-500 dark:text-zinc-400">
                  {coin.description}
                </p>
                <p className="text-[11px] text-zinc-400">
                  {coin.metal.label}
                  {coin.mintage ? ` · Tiratura: ${coin.mintage}` : " · Tiratura: n/d"}
                </p>
                {owned && ownership?.notes && (
                  <p
                    className="line-clamp-2 text-[11px] italic text-zinc-500 dark:text-zinc-400"
                    title={ownership.notes}
                  >
                    “{ownership.notes}”
                  </p>
                )}

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

                {owned && !isGuest && (
                  <CoinDetailsEditor
                    key={`${coin.id}-${ownership?.grade ?? "-"}-${ownership?.notes ?? "-"}`}
                    coinLabel={`${coin.faceValue} ${coin.year}`}
                    initialGrade={ownership?.grade ?? null}
                    initialNotes={ownership?.notes ?? ""}
                    saving={isPending}
                    onSave={(grade, notes) => saveDetails(coin, grade, notes)}
                  />
                )}
              </div>
            </article>
          );
        })}
      </div>
      {visible.length === 0 && (
        <p className="py-16 text-center text-sm text-zinc-500">
          {coins.length === 0
            ? "Nessuna moneta trovata con questi filtri."
            : "Nessuna moneta corrisponde ai filtri. Prova ad azzerarli."}
        </p>
      )}
    </div>
  );
}

function MetalLegend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span
        aria-hidden="true"
        style={{ background: swatch }}
        className="inline-block h-2.5 w-2.5 rounded-full shadow-sm"
      />
      {label}
    </span>
  );
}

function FilterChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full px-2.5 py-1 font-medium transition ${
        active
          ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
          : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
      }`}
    >
      {label}
    </button>
  );
}

function CoinDetailsEditor({
  coinLabel,
  initialGrade,
  initialNotes,
  saving,
  onSave,
}: {
  coinLabel: string;
  initialGrade: Grade | null;
  initialNotes: string;
  saving: boolean;
  onSave: (grade: Grade | null, notes: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [grade, setGrade] = useState<string>(initialGrade ?? "");
  const [notes, setNotes] = useState<string>(initialNotes);

  const dirty =
    (grade || null) !== initialGrade || notes.trim() !== initialNotes.trim();

  return (
    <div className="mt-1 rounded-xl bg-zinc-50 p-2 dark:bg-zinc-800/60">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full text-left text-[11px] font-semibold text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        {open ? "▾ Nascondi grado e note" : "▸ Grado e note"}
      </button>
      {open && (
        <div className="mt-1.5 flex flex-col gap-1.5">
          <label className="flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
            Conservazione
            <select
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
              aria-label={`Grado di conservazione ${coinLabel}`}
              className="flex-1 rounded-lg border border-zinc-300 bg-white px-1.5 py-1 text-[11px] outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
            >
              <option value="">—</option>
              {GRADES.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </label>
          <textarea
            value={notes}
            onChange={(e) =>
              setNotes(
                e.target.value.slice(0, COLLECTION_LIMITS.MAX_NOTES_LENGTH)
              )
            }
            rows={2}
            maxLength={COLLECTION_LIMITS.MAX_NOTES_LENGTH}
            placeholder="Note: acquisto, prezzo, varianti…"
            aria-label={`Note ${coinLabel}`}
            className="w-full resize-none rounded-lg border border-zinc-300 bg-white px-1.5 py-1 text-[11px] outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
          />
          <button
            type="button"
            disabled={!dirty || saving}
            onClick={() =>
              onSave(grade === "" ? null : (grade as Grade), notes)
            }
            className="rounded-lg bg-emerald-600 py-1 text-[11px] font-bold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? "Salvataggio…" : "Salva dettagli"}
          </button>
        </div>
      )}
    </div>
  );
}
