"use server";

import { redirect } from "next/navigation";
import {
  destroySession,
  signInWithPassword,
  signUpWithPassword,
} from "@/lib/auth";

/**
 * Login/registrazione usati da un Client Component: NON si usa redirect()
 * qui dentro perché l'errore NEXT_REDIRECT attraverserebbe il try/catch del
 * client (causa nota di "Minified React error #441" in produzione).
 * Si ritorna { ok: true } e la navigazione la fa il client con router.push.
 *
 * Le action NON lanciano mai: ritornano sempre { ok, error }. Un'eccezione
 * lanciata oltre il boundary in produzione arriva al client come
 * "Minified React error #441" senza spiegazione; con questo pattern
 * l'utente vede sempre il messaggio reale.
 */
export type AuthResult = { ok: true } | { ok: false; error: string };

function toResultError(e: unknown): string {
  const raw =
    e instanceof Error && e.message ? e.message : "Operazione non riuscita.";
  const digest =
    e instanceof Error && typeof (e as { digest?: unknown }).digest === "string"
      ? ((e as { digest?: string }).digest as string)
      : null;
  // Se per qualsiasi motivo arriva comunque un errore minificato,
  // non mostrarlo grezzo: rimanda alla diagnosi.
  if (/Minified React error|#441/i.test(raw)) {
    return digest
      ? `Il server non ha completato l'operazione (codice ${digest}). Apri /api/health per la diagnosi del database e controlla i Function Logs su Vercel.`
      : "Il server non ha completato l'operazione: apri /api/health per la diagnosi del database e riprova.";
  }
  return digest ? `${raw} (codice: ${digest})` : raw;
}

export async function signUpAction(
  email: string,
  password: string
): Promise<AuthResult> {
  try {
    await signUpWithPassword(email, password);
    return { ok: true };
  } catch (e) {
    console.error("[auth] signUpAction fallita:", e);
    return { ok: false, error: toResultError(e) };
  }
}

export async function signInAction(
  email: string,
  password: string
): Promise<AuthResult> {
  try {
    await signInWithPassword(email, password);
    return { ok: true };
  } catch (e) {
    console.error("[auth] signInAction fallita:", e);
    return { ok: false, error: toResultError(e) };
  }
}

/** Logout usato come `action` di un <form>: qui redirect() è il pattern corretto. */
export async function signOutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}
