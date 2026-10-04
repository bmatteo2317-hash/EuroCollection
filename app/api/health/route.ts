import { NextResponse } from "next/server";
import { DB_ENV_KEYS, isDbConfigured, sql } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Diagnostica del collegamento Neon su Vercel.
 * GET /api/health → { ok, stage, present, ... }
 * Non espone valori dei secret, solo se sono presenti/validi.
 */
export async function GET() {
  const started = Date.now();
  const present = DB_ENV_KEYS.filter((k) => {
    const v = process.env[k];
    return typeof v === "string" && v.trim().length > 0;
  });

  if (!isDbConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        stage: "env",
        message:
          "Nessuna connection string trovata. Su Vercel: Project → Storage (Neon) → verifica Environment Variables per Production → Redeploy. In locale: .env.local con DATABASE_URL.",
        present,
        expected: DB_ENV_KEYS,
      },
      { status: 500 }
    );
  }

  try {
    const ping = (await sql()`SELECT 1 AS one`) as unknown as { one: number }[];
    if (!ping?.[0]) throw new Error("Ping vuoto");

    // Query-specchio dell'action + (stessa tabella, stesso WHERE):
    // se questa fallisce mentre il ping riesce, il problema è qui.
    let mirrorOk = false;
    let mirrorError: string | null = null;
    const mirrorStart = Date.now();
    try {
      await sql()`SELECT quantity FROM public.user_collection LIMIT 1`;
      mirrorOk = true;
    } catch (e) {
      mirrorError =
        e instanceof Error && e.message
          ? e.message.replace(/\s+/g, " ").trim().slice(0, 300)
          : "errore sconosciuto";
    }
    const mirrorMs = Date.now() - mirrorStart;

    // Tabelle richieste dallo schema (neon/schema.sql).
    const tables = (await sql()`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    `) as unknown as { tablename: string }[];
    const names = new Set((tables ?? []).map((t) => t.tablename));
    const required = [
      "users",
      "user_collection",
      "user_collection_years",
      "profiles",
      "friendships",
      "trade_offers",
      "trade_requests",
    ];
    const missing = required.filter((t) => !names.has(t));

    if (missing.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          stage: "schema",
          message: `Manca lo schema su Neon (tabelle mancanti: ${missing.join(", ")}). Esegui neon/schema.sql nel SQL Editor di Neon.`,
          missing,
          latencyMs: Date.now() - started,
        },
        { status: 500 }
      );
    }

    if (!mirrorOk) {
      return NextResponse.json(
        {
          ok: false,
          stage: "mirror",
          message:
            "Il ping riesce ma la SELECT su user_collection fallisce: il problema è su quella query, non sulla connessione generica.",
          mirrorError,
          mirrorMs,
          present,
          latencyMs: Date.now() - started,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      stage: "ok",
      message: "Neon raggiungibile e schema presente.",
      present,
      mirrorMs,
      latencyMs: Date.now() - started,
    });
  } catch (e) {
    console.error("[health] Neon non raggiungibile:", e);
    return NextResponse.json(
      {
        ok: false,
        stage: "connection",
        message:
          e instanceof Error
            ? e.message
            : "Neon non raggiungibile: progetto in pausa o connection string errata.",
        present,
        latencyMs: Date.now() - started,
      },
      { status: 500 }
    );
  }
}
