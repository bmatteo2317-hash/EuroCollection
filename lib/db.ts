import { neon, neonConfig } from "@neondatabase/serverless";

// Su Vercel/Edge il driver usa fetch con pooling: si abilita la cache
// della connessione solo quando richiesto.
neonConfig.fetchConnectionCache = true;

export type Sql = ReturnType<typeof neon>;

/**
 * Client SQL Neon. Legge la prima connection string disponibile tra quelle
 * create dall'integrazione Neon ↔ Vercel (pooled preferite).
 * Creato lazy così le pagine guest / build senza env non crashano.
 *
 * NOTA Vercel + Neon: l'integrazione Neon su Vercel inietta
 * DATABASE_URL / POSTGRES_URL (pooled) + varianti _UNPOOLED / _NON_POOLING.
 * Se il deploy mostra "Minified React error #441", la causa reale è quasi
 * sempre qui (env mancante) o schema non eseguito: il digest nei Function
 * Log di Vercel contiene il messaggio originale.
 */
let cached: Sql | null = null;
let cachedKey: string | null = null;

const CANDIDATES = [
  "DATABASE_URL",
  "POSTGRES_URL",
  "NEON_DATABASE_URL",
  "NEON_POSTGRES_URL",
  "DATABASE_URL_UNPOOLED",
  "POSTGRES_URL_NON_POOLING",
  "POSTGRES_URL_NO_SSL",
  "POSTGRES_PRISMA_URL",
] as const;

export const DB_ENV_KEYS: readonly string[] = CANDIDATES;

function findConnectionString(): { key: string; value: string } | null {
  for (const k of CANDIDATES) {
    const v = process.env[k];
    if (typeof v === "string" && v.trim().length > 0) {
      return { key: k, value: v.trim() };
    }
  }
  return null;
}

/** true se esiste almeno una connection string (non dice se è valida). */
export function isDbConfigured(): boolean {
  return findConnectionString() !== null;
}

export const MISSING_ENV_MESSAGE =
  "Database non configurato: su Vercel apri Project → Storage (Neon) e verifica che le Environment Variables (DATABASE_URL) siano presenti per l'ambiente Production, poi fai Redeploy. In locale usa .env.local con DATABASE_URL.";

export function sql(): Sql {
  if (cached && cachedKey) {
    // Se le env sono cambiate (test), ricrea il client.
    const current = findConnectionString();
    if (current && current.key === cachedKey) return cached;
    cached = null;
    cachedKey = null;
  }
  const found = findConnectionString();
  if (!found) {
    throw new Error(MISSING_ENV_MESSAGE);
  }
  cached = neon(found.value);
  cachedKey = found.key;
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

/** true se l'errore è "env mancante" generato da sql(). */
export function isMissingEnvError(error: unknown): boolean {
  return error instanceof Error && error.message === MISSING_ENV_MESSAGE;
}

/** true per errori di rete/TLS/timeout verso Neon (progetto in pausa, URL errato…). */
export function isConnectionError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { message, code } = error as { message?: unknown; code?: unknown };
  if (
    typeof code === "string" &&
    ["ENOTFOUND", "ECONNREFUSED", "ETIMEDOUT", "ECONNRESET"].includes(code)
  ) {
    return true;
  }
  if (typeof message !== "string") return false;
  return /fetch failed|network|timeout|timed out|connection|econn|enotfound|ssl|neon/i.test(
    message
  );
}

export const NEON_UNREACHABLE_MESSAGE =
  "Neon non raggiungibile: controlla che il progetto Neon sia attivo (non in pausa) e che la connection string su Vercel sia quella pooled con ?sslmode=require, poi fai Redeploy.";

/**
 * Converte QUALSIASI errore DB in un Error con messaggio stabile e
 * serializzabile. Fondamentale: in produzione gli errori grezzi delle
 * Server Action arrivano al client come "Minified React error #441"
 * (solo digest), mentre questi messaggi restano leggibili.
 */
export function toFriendlyDbError(error: unknown, fallback: string): Error {
  if (isMissingEnvError(error)) return new Error(MISSING_ENV_MESSAGE);
  if (isMissingTableError(error)) return new Error(MISSING_TABLES_MESSAGE);
  if (isConnectionError(error)) return new Error(NEON_UNREACHABLE_MESSAGE);
  if (error instanceof Error && error.message) {
    // Messaggi già curati dal nostro codice (VALIDATION, NOT_OWNED…).
    if (
      /^(UNAUTHENTICATED|NOT_OWNED|NOT_FOUND|FORBIDDEN|STATE|SELF|INVALID_YEAR|OFFER_UNAVAILABLE)/.test(
        error.message
      )
    ) {
      return error;
    }
    // Evita di leakare dettagli driver in produzione: mostra un fallback
    // breve e logga l'originale nei server log (Vercel Function Logs).
    console.error("[db] errore Neon:", error);
    return new Error(fallback);
  }
  console.error("[db] errore Neon non-Error:", error);
  return new Error(fallback);
}
