import { redirect } from "next/navigation";
import {
  getCatalog,
  getCountriesWithCounts,
  getTotalCount,
} from "@/lib/catalog";
import { createClient } from "@/lib/supabase/server";
import ProgressCircle from "@/components/ProgressCircle";
import CoinGrid from "@/components/CoinGrid";

export default async function CollezionePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await supabase
    .from("user_collection")
    .select("coin_id, quantity")
    .eq("user_id", user.id);

  const collection: Record<string, number> = {};
  for (const row of data ?? []) {
    if (row.quantity > 0) collection[row.coin_id] = row.quantity;
  }

  const catalog = getCatalog();
  const total = getTotalCount();
  const ownedIds = new Set(Object.keys(collection));
  const ownedCoins = catalog.filter((c) => ownedIds.has(c.id));
  const owned = ownedCoins.length;
  const pieces = ownedCoins.reduce((s, c) => s + (collection[c.id] ?? 0), 0);
  const byCountry = getCountriesWithCounts().map((c) => ({
    ...c,
    owned: catalog.filter(
      (coin) => coin.country === c.code && ownedIds.has(coin.id)
    ).length,
  }));

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-3xl font-extrabold">La mia collezione</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {user.email} · {pieces} pezzi totali · {owned} tipi distinti
        </p>
      </header>

      <section className="rounded-3xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <ProgressCircle owned={owned} total={total} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">Avanzamento per paese</h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {byCountry.map((c) => {
            const pct = c.total ? (c.owned / c.total) * 100 : 0;
            return (
              <a
                key={c.code}
                href={`/paese/${c.code}`}
                className="rounded-2xl border border-zinc-200 bg-white p-3 hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="flex items-center justify-between text-sm">
                  <span>
                    {c.flag} <strong>{c.name}</strong>
                  </span>
                  <span className="tabular-nums text-zinc-500">
                    {c.owned}/{c.total}
                  </span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                  <div
                    className="h-full rounded-full bg-emerald-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </a>
            );
          })}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">Monete possedute ({owned})</h2>
        {owned === 0 ? (
          <p className="rounded-2xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700">
            Ancora nessuna moneta. Vai nel{" "}
            <a
              href="/"
              className="font-semibold text-emerald-700 hover:underline dark:text-emerald-400"
            >
              catalogo
            </a>{" "}
            e premi + sulle monete che hai.
          </p>
        ) : (
          <CoinGrid
            coins={ownedCoins.sort((a, b) => b.year - a.year)}
            initialCollection={collection}
            isGuest={false}
          />
        )}
      </section>
    </div>
  );
}
