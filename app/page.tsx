import Link from "next/link";
import {
  getCatalog,
  getCountriesWithCounts,
  getTotalCount,
} from "@/lib/catalog";
import { getDeviceUserId } from "@/lib/auth";
import { fetchOwnershipSafe, fetchYearsSafe } from "@/lib/collection";
import ProgressCircle from "@/components/ProgressCircle";
import CountryExplorer from "@/components/CountryExplorer";
import CoinGrid from "@/components/CoinGrid";
import type { CollectionMap, CoinYearsMap, OwnershipMap } from "@/lib/types";

// Pagina personalizzata (mostra il progresso dell'utente loggato):
// deve essere renderizzata dinamicamente, non prerenderizzata in build
// (usa cookies() via sessione). Il catalogo resta economico da calcolare
// per-request (~879 monete da dati statici del package).
export const dynamic = "force-dynamic";

export default async function Home() {
  const countries = getCountriesWithCounts();
  const total = getTotalCount();
  const catalog = getCatalog();
  const commemoratives = catalog.filter((c) => c.isCommemorative).slice(0, 10);

  // Collezione del dispositivo per statistiche + UI in home.
  // Niente login: il primo + crea da solo l'account (provision lazy).
  let collection: CollectionMap = {};
  let details: OwnershipMap = {};
  let coinYears: CoinYearsMap = {};
  let owned = 0;
  const deviceId = await getDeviceUserId();
  if (deviceId) {
    // Versioni Safe: MAI throw (un throw qui = pagina #441 in produzione).
    const fetched = await fetchOwnershipSafe(deviceId);
    collection = fetched.quantities;
    details = fetched.details;
    coinYears = await fetchYearsSafe(deviceId);
    owned = Object.keys(collection).length;
  }

  return (
    <div className="flex flex-col gap-10">
      {/* HERO + DASHBOARD */}
      <section className="grid gap-6 rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8 lg:grid-cols-2 dark:border-zinc-800 dark:bg-zinc-900">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
            Tutte le monete Euro,{" "}
            <span className="text-emerald-600">la tua collezione.</span>
          </h1>
          <p className="mt-3 max-w-lg text-sm leading-6 text-zinc-600 dark:text-zinc-300">
            Catalogo statico generato da <code>@euro-coins/source</code>{" "}
            (immagini ufficiali BCE, {total} monete) + collezione privata
            salvata su Neon. Le monete non possedute sono in bianco e
            nero, quelle possedute si colorano e mostrano il badge{" "}
            <strong>x2</strong>.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/collezione"
              className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900"
            >
              📊 La mia dashboard
            </Link>
            <Link
              href="/profilo"
              className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-semibold hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              👤 Personalizza il profilo
            </Link>
          </div>
        </div>
        <div className="flex items-center justify-start lg:justify-end">
          <ProgressCircle owned={owned} total={total} />
        </div>
      </section>

      {/* PAESI */}
      <section className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xl font-bold">Sfoglia per paese</h2>
          <span className="text-xs text-zinc-500">
            Pagine statiche generate a build-time
          </span>
        </div>
        <CountryExplorer countries={countries} />
      </section>

      {/* ANTEPRIMA COMMEMORATIVI */}
      <section className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xl font-bold">In evidenza: 2 € commemorativi</h2>
          <Link
            href="/paese/it"
            className="text-sm font-semibold text-emerald-700 hover:underline dark:text-emerald-400"
          >
            Vedi l&apos;Italia →
          </Link>
        </div>
        <CoinGrid
          coins={commemoratives}
          initialCollection={collection}
          initialDetails={details}
          initialYears={coinYears}
          isGuest={false}
        />
      </section>
    </div>
  );
}
