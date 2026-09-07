"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { CountrySummary } from "@/lib/catalog";
import CountryFlag from "@/components/CountryFlag";

export default function CountryExplorer({
  countries,
}: {
  countries: CountrySummary[];
}) {
  const [q, setQ] = useState("");
  const [onlyComm, setOnlyComm] = useState(false);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return countries.filter((c) => {
      if (onlyComm && c.commemoratives === 0) return false;
      if (!needle) return true;
      return (
        c.name.toLowerCase().includes(needle) ||
        c.code.toLowerCase().includes(needle)
      );
    });
  }, [countries, q, onlyComm]);

  return (
    <section>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cerca paese… (es. Italia, Finl…)"
          className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm outline-none focus:border-zinc-500 sm:max-w-xs dark:border-zinc-700 dark:bg-zinc-900"
        />
        <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
          <input
            type="checkbox"
            checked={onlyComm}
            onChange={(e) => setOnlyComm(e.target.checked)}
            className="h-4 w-4 accent-emerald-600"
          />
          Solo paesi con commemorativi
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {filtered.map((c) => (
          <Link
            key={c.code}
            href={`/paese/${c.code}`}
            className="group rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900"
          >
            <div className="h-8">
              <CountryFlag code={c.code} name={c.name} size={36} />
            </div>
            <div className="mt-2 font-bold text-zinc-900 dark:text-zinc-50">
              {c.name}
            </div>
            <div className="mt-1 text-xs text-zinc-500">
              {c.total} monete · {c.commemoratives} comm.
            </div>
            <div className="mt-2 text-xs font-semibold text-emerald-700 group-hover:underline dark:text-emerald-400">
              Apri catalogo →
            </div>
          </Link>
        ))}
      </div>
      {filtered.length === 0 && (
        <p className="py-10 text-center text-sm text-zinc-500">
          Nessun paese trovato.
        </p>
      )}
    </section>
  );
}
