import { notFound } from "next/navigation";
import Link from "next/link";
import {
  COUNTRIES,
  COUNTRY_NAMES,
  getCoinsByCountry,
  getTotalCount,
  isValidCountry,
} from "@/lib/catalog";
import { getDeviceUserId } from "@/lib/auth";
import { fetchOwnershipSafe, fetchYearsSafe } from "@/lib/collection";
import CoinGrid from "@/components/CoinGrid";
import CountryFlag from "@/components/CountryFlag";
import type { CollectionMap, CoinYearsMap, OwnershipMap } from "@/lib/types";

// Le pagine paese mostrano il possesso dell'utente loggato (cookies via
// sessione): rendering dinamico per-request. `generateStaticParams` resta
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
  const comm = coins.filter((c) => c.isCommemorative).length;

  let collection: CollectionMap = {};
  let details: OwnershipMap = {};
  let coinYears: CoinYearsMap = {};
  let ownedHere = 0;
  // Niente login: la collezione è del dispositivo (il primo + crea l'account).
  const deviceId = await getDeviceUserId();
  if (deviceId) {
    // Versioni Safe: MAI throw (un throw qui = pagina #441 in produzione).
    const fetched = await fetchOwnershipSafe(deviceId);
    collection = fetched.quantities;
    details = fetched.details;
    coinYears = await fetchYearsSafe(deviceId);
    for (const id of Object.keys(collection)) {
      if (id.startsWith(`${country}-`)) ownedHere += 1;
    }
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
        <CountryFlag code={country} name={name} size={64} />
        <div>
          <h1 className="text-3xl font-extrabold">{name}</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {coins.length} monete · {comm} commemorativi ·{" "}
            {deviceId
              ? `ne possiedi ${ownedHere} (${pct}%)`
              : "premi + sulle monete che possiedi"}
          </p>
        </div>
      </header>

      {deviceId && coins.length > 0 && (
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

      <CoinGrid
        coins={coins}
        initialCollection={collection}
        initialDetails={details}
        initialYears={coinYears}
        isGuest={false}
      />

      <p className="text-center text-xs text-zinc-400">
        Totale Eurozona: {total} monete · Descrizioni curate per i principali
        commemorativi.
      </p>
    </div>
  );
}
