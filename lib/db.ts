import { neon, neonConfig } from "@neondatabase/serverless";

// Su Vercel/Edge il driver usa fetch con pooling: si abilita la cache
// della connessione solo quando richiesto.
neonConfig.fetchConnectionCache = true;

export type Sql = ReturnType<typeof neon>;

/**
 * Client SQL Neon. Legge la prima connection string disponibile tra quelle
 * create dall'integrazione Neon ↔ Vercel (pooled preferite).
 * Creato lazy così le pagine guest / build senza env non crashano.
 */
let cached: Sql | null = null;

const CANDIDATES = [
  "DATABASE_URL",
  "POSTGRES_URL",
  "DATABASE_URL_UNPOOLED",
  "POSTGRES_URL_NON_POOLING",
  "POSTGRES_PRISMA_URL",
] as const;

export function sql(): Sql {
  if (cached) return cached;
  const found = CANDIDATES.find((k) => process.env[k]);
  if (!found) {
    throw new Error(
      "Nessuna connection string di Neon trovata: verifica le Environment Variables su Vercel (DATABASE_URL)."
    );
  }
  cached = neon(process.env[found] as string);
  return cached;
}

/** Errore Postgres "tabella inesistente" (42P01): schema non eseguito. */
export function isMissingTableError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  if (code === "42P01") return true;
  return typeof message === "string" && /relation .* does not exist/i.test(message);
}

export const MISSING_TABLES_MESSAGE =
  "Manca lo schema su Neon: esegui neon/schema.sql nel SQL Editor di Neon.";
