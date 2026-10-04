"use server";

import { redirect } from "next/navigation";
import { toActionError } from "@/lib/db";
import {
  AUTH_SECRET_MESSAGE,
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
  // AUTH_SECRET: messaggio esplicito con istruzioni Vercel.
  if (e instanceof Error && e.message === AUTH_SECRET_MESSAGE) return e.message;
  return toActionError(e);
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
