import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { sql } from "@/lib/db";

export interface SessionUser {
  id: string;
  email: string | null;
}

const COOKIE_NAME = "euro_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 giorni

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "AUTH_SECRET mancante o troppo corto (min 32 caratteri): genera con `openssl rand -base64 32`."
    );
  }
  return new TextEncoder().encode(secret);
}

function cleanEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function validateCredentials(email: string, password: string): string | null {
  const e = email.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return "Inserisci un indirizzo email valido.";
  if (password.length < 6) return "La password deve avere almeno 6 caratteri.";
  if (password.length > 200) return "La password è troppo lunga.";
  return null;
}

/** Crea il JWT di sessione e lo scrive nel cookie httpOnly. */
export async function createSession(user: SessionUser): Promise<void> {
  const token = await new SignJWT({ sub: user.id, email: user.email ?? undefined })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secretKey());
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

/** Legge e verifica il cookie di sessione. Ritorna null se assente/scaduto. */
export async function getSessionUser(): Promise<SessionUser | null> {
  let token: string | undefined;
  try {
    const store = await cookies();
    token = store.get(COOKIE_NAME)?.value;
  } catch {
    return null;
  }
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    const id = typeof payload.sub === "string" ? payload.sub : null;
    if (!id) return null;
    const email = typeof payload.email === "string" ? payload.email : null;
    return { id, email };
  } catch {
    return null;
  }
}

export async function requireSessionUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  return user;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

interface UserRow {
  id: string;
  email: string | null;
  password_hash: string | null;
}

async function findUserByEmail(email: string): Promise<UserRow | null> {
  const res = (await sql()`SELECT id, email, password_hash FROM public.users WHERE lower(email) = lower(${email}) LIMIT 1`) as unknown as UserRow[];
  return res[0] ?? null;
}

/**
 * Registra un nuovo utente (email + password) e apre subito la sessione.
 * Profili pubblici creati dal trigger DB on_user_created.
 */
export async function signUpWithPassword(email: string, password: string): Promise<SessionUser> {
  const err = validateCredentials(email, password);
  if (err) throw new Error(err);
  const clean = cleanEmail(email);
  const existing = await findUserByEmail(clean);
  if (existing) throw new Error("Questo indirizzo è già registrato: accedi invece di registrarti.");
  const passwordHash = await hashPassword(password);
  const res = (await sql()`INSERT INTO public.users (email, password_hash) VALUES (${clean}, ${passwordHash}) RETURNING id, email`) as unknown as { id: string; email: string | null }[];
  const row = res[0];
  const user: SessionUser = { id: row.id, email: row.email };
  await createSession(user);
  return user;
}

/** Login con email + password esistenti, apre la sessione. */
export async function signInWithPassword(email: string, password: string): Promise<SessionUser> {
  const err = validateCredentials(email, password);
  if (err) throw new Error(err);
  const clean = cleanEmail(email);
  const found = await findUserByEmail(clean);
  if (!found || !found.password_hash) throw new Error("Credenziali non valide: controlla email e password.");
  const ok = await verifyPassword(password, found.password_hash);
  if (!ok) throw new Error("Credenziali non valide: controlla email e password.");
  const user: SessionUser = { id: found.id, email: found.email };
  await createSession(user);
  return user;
}
