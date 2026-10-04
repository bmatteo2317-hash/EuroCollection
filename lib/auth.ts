import { cookies } from "next/headers";
import { sql, toFriendlyDbError } from "@/lib/db";

/**
 * Identità SOLO dispositivo (modello HOME-GYM): niente email, niente
 * password, niente AUTH_SECRET. Il browser ha un cookie `euro_device`
 * con un UUID; la prima scrittura crea da sola la riga in
 * public.users (+ profilo via trigger). Il nome visualizzato si cambia
 * in /profilo. Ogni dispositivo ha il suo account; per usare lo stesso
 * su due dispositivi basta importare l'ID in /profilo.
 */

const COOKIE_NAME = "euro_device";
// 400 giorni (max pratico per i cookie persistenti).
const MAX_AGE_SECONDS = 60 * 60 * 24 * 400;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidDeviceId(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/** Legge l'ID dispositivo dal cookie. MAI throw (null = dispositivo nuovo). */
export async function getDeviceUserId(): Promise<string | null> {
  try {
    const store = await cookies();
    const raw = store.get(COOKIE_NAME)?.value;
    return isValidDeviceId(raw) ? raw : null;
  } catch {
    return null;
  }
}

async function writeDeviceCookie(id: string): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

/** Crea la riga utente se manca (idempotente) e imposta il cookie. */
async function provisionDeviceUser(id: string): Promise<void> {
  await sql()`INSERT INTO public.users (id) VALUES (${id}) ON CONFLICT (id) DO NOTHING`;
  await writeDeviceCookie(id);
}

/**
 * ID dispositivo garantito: se il cookie manca o è invalido, crea un
 * nuovo account e lo imposta. Usato dalle pagine personali e da tutte
 * le action di scrittura. Lancia solo se il DB è davvero giù (mai-throw
 * gestito dai chiamanti con toActionError / fallback vuoto).
 */
export async function ensureDeviceUserId(): Promise<string> {
  const existing = await getDeviceUserId();
  if (existing) {
    try {
      await sql()`INSERT INTO public.users (id) VALUES (${existing}) ON CONFLICT (id) DO NOTHING`;
    } catch (e) {
      throw toFriendlyDbError(e, "Database non disponibile, riprova tra poco.");
    }
    return existing;
  }
  const fresh = crypto.randomUUID();
  try {
    await provisionDeviceUser(fresh);
  } catch (e) {
    throw toFriendlyDbError(e, "Database non disponibile, riprova tra poco.");
  }
  return fresh;
}

/**
 * Collega questo browser a un account esistente (ID copiato da un altro
 * dispositivo). Ritorna false se l'ID non è un UUID valido.
 */
export async function adoptDeviceId(id: string): Promise<boolean> {
  if (!isValidDeviceId(id)) return false;
  try {
    await provisionDeviceUser(id);
    return true;
  } catch {
    return false;
  }
}
