import { notFound } from "next/navigation";
import Link from "next/link";
import {
  COUNTRIES,
  COUNTRY_FLAGS,
  COUNTRY_NAMES,
  getCoinsByCountry,
  getTotalCount,
  isValidCountry,
} from "@/lib/catalog";
import { createClient } from "@/lib/supabase/server";
import CoinGrid from "@/components/CoinGrid";
import type { CollectionMap } from "@/lib/types";

// Le pagine paese mostrano il possesso dell'utente loggato (cookies via
// Supabase): rendering dinamico per-request. `generateStaticParams` resta
// come elenco di rotte valide per metadata/sitemap; l'HTML resta
// server-rendered (ok per SEO) ma non prerenderizzato in build.
export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return COUNTRIES.map((country) => ({ country }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ country: string }>;
}) {
  const { country } = await params;
  const name =
    COUNTRY_NAMES[country as keyof typeof COUNTRY_NAMES] ?? country;
  return { title: `${name} — Monete Euro | EuroCollection` };
}

export default async function PaesePage({
  params,
}: {
  params: Promise<{ country: string }>;
}) {
  const { country } = await params;
  if (!isValidCountry(country)) notFound();

  const coins = getCoinsByCountry(country);
  const total = getTotalCount();
  const name = COUNTRY_NAMES[country];
  const flag = COUNTRY_FLAGS[country] ?? "🇪🇺";
  const comm = coins.filter((c) => c.isCommemorative).length;

  let collection: CollectionMap = {};
  let ownedHere = 0;
  let isGuest = true;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      isGuest = false;
      const { data } = await supabase
        .from("user_collection")
        .select("coin_id, quantity")
        .eq("user_id", user.id);
      for (const row of data ?? []) {
        if (row.quantity > 0) {
          collection[row.coin_id] = row.quantity;
          if (row.coin_id.startsWith(`${country}-`)) ownedHere += 1;
        }
      }
    }
  } catch {
    // Build senza env: pagina statica comunque consultabile
  }

  const pct = coins.length
    ? ((ownedHere / coins.length) * 100).toFixed(1)
    : "0.0";

  return (
    <div className="flex flex-col gap-6">
      <nav className="text-xs text-zinc-500">
        <Link href="/" className="hover:underline">
          Catalogo
        </Link>{" "}
        / {name}
      </nav>

      <header className="flex flex-wrap items-center gap-4">
        <span className="text-5xl">{flag}</span>
        <div>
          <h1 className="text-3xl font-extrabold">{name}</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {coins.length} monete · {comm} commemorativi ·{" "}
            {isGuest
              ? "accedi per tracciare il possesso"
              : `ne possiedi ${ownedHere} (${pct}%)`}
          </p>
        </div>
      </header>

      {!isGuest && coins.length > 0 && (
        <div
          className="h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
          role="progressbar"
          aria-valuenow={Math.round((ownedHere / coins.length) * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: `${(ownedHere / coins.length) * 100}%` }}
          />
        </div>
      )}

      {isGuest && (
        <p
          id="login-hint"
          className="rounded-2xl border border-dashed border-zinc-300 p-3 text-xs text-zinc-500 dark:border-zinc-700"
        >
          Stai sfogliando come ospite: i pulsanti + / − sono attivi dopo il{" "}
          <Link
            href="/login"
            className="font-semibold text-emerald-700 hover:underline dark:text-emerald-400"
          >
            login
          </Link>
          .
        </p>
      )}

      <CoinGrid
        coins={coins}
        initialCollection={collection}
        isGuest={isGuest}
      />

      <p className="text-center text-xs text-zinc-400">
        Totale Eurozona: {total} monete · Descrizioni curate per i principali
        commemorativi, tiratura dove documentata.
      </p>
    </div>
  );
}
