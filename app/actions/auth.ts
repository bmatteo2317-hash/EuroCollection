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
 */
export async function signUpAction(
  email: string,
  password: string
): Promise<{ ok: true }> {
  await signUpWithPassword(email, password);
  return { ok: true };
}

export async function signInAction(
  email: string,
  password: string
): Promise<{ ok: true }> {
  await signInWithPassword(email, password);
  return { ok: true };
}

/** Logout usato come `action` di un <form>: qui redirect() è il pattern corretto. */
export async function signOutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}
