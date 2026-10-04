"use client";

import { useEffect } from "react";

/**
 * Boundary di rotta: se un Server Component lancia durante render/revalidate
 * (es. Neon irraggiungibile), in produzione Next mostrerebbe altrimenti
 * "Minified React error #441" a pagina intera. Qui mostriamo un messaggio
 * leggibile + digest (il digest corrisponde ai Function Logs su Vercel).
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[route-error]", error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-4 py-16 text-center">
      <h1 className="text-2xl font-extrabold">Qualcosa è andato storto</h1>
      <p className="text-sm text-zinc-500">
        La pagina non è riuscita a caricarsi. Se hai appena collegato Neon su
        Vercel, controlla le Environment Variables e di aver eseguito{" "}
        <code>neon/schema.sql</code> nel SQL Editor di Neon.
      </p>
      {error?.digest && (
        <p className="rounded-xl bg-zinc-100 px-3 py-2 text-xs text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
          Codice errore (Vercel Function Logs): {error.digest}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => reset()}
          className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900"
        >
          Riprova
        </button>
        <a
          href="/api/health"
          target="_blank"
          rel="noreferrer"
          className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-semibold hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          Diagnostica DB
        </a>
      </div>
    </div>
  );
}
