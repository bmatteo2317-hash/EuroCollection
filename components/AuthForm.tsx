"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function AuthForm({
  initialError = null,
}: {
  initialError?: string | null;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"password" | "magic">("password");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(initialError);

  const supabase = createClient();

  /** Traduce gli errori Auth più comuni in messaggi comprensibili. */
  function friendlyAuthError(e: unknown): string {
    const raw = e instanceof Error ? e.message : "";
    if (/email not confirmed/i.test(raw))
      return "Devi prima confermare l'email: clicca il link che ti abbiamo inviato, poi accedi.";
    if (/invalid login credentials/i.test(raw))
      return "Credenziali non valide: controlla email e password.";
    if (/user already registered/i.test(raw))
      return "Questo indirizzo è già registrato: accedi invece di registrarti.";
    if (/over_email_send_rate_limit|too many requests/i.test(raw))
      return "Troppe email inviate: attendi qualche minuto e riprova.";
    if (/signup.*disabled|signups not allowed/i.test(raw))
      return "Le registrazioni sono disabilitate su questo progetto.";
    return raw || "Operazione non riuscita.";
  }

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    setMsg(null);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
      router.push("/");
      router.refresh();
    } catch (e: unknown) {
      setErr(friendlyAuthError(e));
    } finally {
      setLoading(false);
    }
  }

  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    setMsg(null);
    try {
      // emailRedirectTo è fondamentale: senza, il link di conferma punta al
      // Site URL di Supabase e non torna mai a /auth/callback (verifica rotta).
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) throw error;
      // Verifica email NON obbligatoria: nessuna conferma da attendere,
      // ci si fida dell'indirizzo inserito. Se la sessione è immediata si
      // mostra il messaggio e poi si entra; altrimenti si invita ad accedere.
      setMsg(
        "Account creato! Spero tu abbia inserito la mail giusta: accedi pure, io mi fido di te."
      );
      if (data.session) {
        setTimeout(() => {
          router.push("/");
          router.refresh();
        }, 1500);
      }
    } catch (e: unknown) {
      setErr(friendlyAuthError(e));
    } finally {
      setLoading(false);
    }
  }

  async function magicLink(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    setMsg(null);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) throw error;
      setMsg("Magic link inviato! Controlla la tua casella email.");
    } catch (e: unknown) {
      setErr(
        e instanceof Error ? e.message : "Invio magic link non riuscito."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-4 flex rounded-full bg-zinc-100 p-1 text-sm dark:bg-zinc-800">
        <button
          onClick={() => setMode("password")}
          className={`flex-1 rounded-full px-3 py-1.5 font-medium ${mode === "password" ? "bg-white shadow dark:bg-zinc-900" : "text-zinc-500"}`}
        >
          Email + Password
        </button>
        <button
          onClick={() => setMode("magic")}
          className={`flex-1 rounded-full px-3 py-1.5 font-medium ${mode === "magic" ? "bg-white shadow dark:bg-zinc-900" : "text-zinc-500"}`}
        >
          Magic Link
        </button>
      </div>

      {mode === "magic" ? (
        <form onSubmit={magicLink} className="flex flex-col gap-3">
          <input
            type="email"
            required
            placeholder="tua@email.it"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-xl border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
          />
          <button
            disabled={loading}
            className="rounded-xl bg-zinc-900 py-2 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {loading ? "Invio…" : "✉️ Invia magic link"}
          </button>
        </form>
      ) : (
        <form className="flex flex-col gap-3">
          <input
            type="email"
            required
            placeholder="tua@email.it"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-xl border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
          />
          <input
            type="password"
            required
            minLength={6}
            placeholder="Password (min 6 caratteri)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-xl border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
          />
          <div className="flex gap-2">
            <button
              onClick={signIn}
              disabled={loading}
              className="flex-1 rounded-xl bg-zinc-900 py-2 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
            >
              {loading ? "…" : "Accedi"}
            </button>
            <button
              onClick={signUp}
              disabled={loading}
              className="flex-1 rounded-xl border border-zinc-300 py-2 text-sm font-semibold hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              Registrati
            </button>
          </div>
        </form>
      )}

      {msg && (
        <p className="mt-3 rounded-xl bg-emerald-50 p-2 text-xs text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
          {msg}
        </p>
      )}
      {err && (
        <p className="mt-3 rounded-xl bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-200">
          {err}
        </p>
      )}
    </div>
  );
}
