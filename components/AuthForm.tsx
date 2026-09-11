"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signInAction, signUpAction } from "@/app/actions/auth";

export default function AuthForm({
  initialError = null,
}: {
  initialError?: string | null;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(initialError);

  function toDetail(e: unknown): string {
    return e instanceof Error ? e.message : "Operazione non riuscita.";
  }

  /** A successo naviga alla home (il cookie di sessione è già stato scritto). */
  function goHome(): void {
    router.push("/");
    router.refresh();
  }

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    setMsg(null);
    try {
      await signInAction(email, password);
      goHome();
    } catch (e: unknown) {
      setErr(toDetail(e));
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
      await signUpAction(email, password);
      setMsg("Account creato! Accesso in corso…");
      goHome();
    } catch (e: unknown) {
      setMsg(null);
      setErr(toDetail(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <form className="flex flex-col gap-3" onSubmit={signIn}>
        <input
          type="email"
          required
          placeholder="tua@email.it"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-xl border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
        />
        <div className="relative">
          <input
            type={showPassword ? "text" : "password"}
            required
            minLength={6}
            placeholder="Password (min 6 caratteri)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-zinc-300 px-3 py-2 pr-11 text-sm dark:border-zinc-700 dark:bg-zinc-800"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Nascondi password" : "Mostra password"}
            aria-pressed={showPassword}
            title={showPassword ? "Nascondi password" : "Mostra password"}
            className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-xl text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            {showPassword ? (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                <line x1="2" y1="2" x2="22" y2="22" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
                <path d="M2 12s3.5-8 10-8 10 8 10 8-3.5 8-10 8-10-8-10-8Z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
        </div>
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={loading}
            className="flex-1 rounded-xl bg-zinc-900 py-2 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {loading ? "…" : "Accedi"}
          </button>
          <button
            type="button"
            onClick={signUp}
            disabled={loading}
            className="flex-1 rounded-xl border border-zinc-300 py-2 text-sm font-semibold hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Registrati
          </button>
        </div>
      </form>

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
