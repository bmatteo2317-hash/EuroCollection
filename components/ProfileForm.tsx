"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { adoptDevice, saveProfile } from "@/app/actions/profile";
import { AVATAR_CHOICES } from "@/lib/profile";

export interface CountryOption {
  code: string;
  name: string;
  flag: string;
}

export default function ProfileForm({
  initialName,
  initialAvatar,
  initialCountry,
  countries,
  deviceId,
}: {
  initialName: string;
  initialAvatar: string;
  initialCountry: string;
  countries: CountryOption[];
  deviceId: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState(initialName);
  const [avatar, setAvatar] = useState(initialAvatar);
  const [country, setCountry] = useState(initialCountry);
  const [importId, setImportId] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const dirty =
    name.trim() !== initialName.trim() ||
    avatar !== initialAvatar ||
    country !== initialCountry;

  const save = (): void => {
    setErr(null);
    setMsg(null);
    startTransition(async () => {
      const res = await saveProfile({ displayName: name, avatar, country });
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      setMsg("Profilo salvato! 🎉");
      router.refresh();
    });
  };

  const doAdopt = (): void => {
    setErr(null);
    setMsg(null);
    startTransition(async () => {
      const res = await adoptDevice(importId);
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      setMsg("Dispositivo collegato: ora vedi la stessa collezione! 🔗");
      setImportId("");
      router.refresh();
    });
  };

  const copyId = async (): Promise<void> => {
    if (!deviceId) return;
    try {
      await navigator.clipboard.writeText(deviceId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setErr("Copia non riuscita: seleziona l'ID a mano.");
    }
  };

  return (
    <div className="flex flex-col gap-5" aria-busy={isPending}>
      {msg && (
        <p className="rounded-xl bg-emerald-50 p-3 text-center text-xs font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
          {msg}
        </p>
      )}
      {err && (
        <p
          role="alert"
          className="rounded-xl bg-red-50 p-3 text-center text-xs font-medium text-red-700 dark:bg-red-950 dark:text-red-200"
        >
          {err}
        </p>
      )}

      <section className="flex flex-col gap-4 rounded-3xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-lg font-bold">👤 Il tuo collezionista</h2>

        <div>
          <p className="mb-2 text-xs font-semibold text-zinc-500">
            Avatar
          </p>
          <div
            role="radiogroup"
            aria-label="Scegli avatar"
            className="grid grid-cols-6 gap-2"
          >
            {AVATAR_CHOICES.map((a) => (
              <button
                key={a}
                type="button"
                role="radio"
                aria-checked={avatar === a}
                aria-label={`Avatar ${a}`}
                onClick={() => setAvatar(a)}
                className={`flex aspect-square items-center justify-center rounded-2xl text-2xl transition ${
                  avatar === a
                    ? "bg-zinc-900 shadow-md ring-2 ring-emerald-500 dark:bg-zinc-100"
                    : "bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700"
                }`}
              >
                {a}
              </button>
            ))}
          </div>
        </div>

        <label className="flex flex-col gap-1 text-xs font-semibold">
          Nome visualizzato
          <input
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, 40))}
            placeholder="es. Marco"
            maxLength={40}
            aria-label="Nome visualizzato"
            className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-800"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs font-semibold">
          Paese del cuore
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            aria-label="Paese del cuore"
            className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-800"
          >
            <option value="">— Nessuno —</option>
            {countries.map((c) => (
              <option key={c.code} value={c.code}>
                {c.flag} {c.name}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          disabled={isPending || !dirty}
          onClick={save}
          className="rounded-xl bg-zinc-900 py-2 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {isPending ? "Salvataggio…" : "Salva profilo"}
        </button>
      </section>

      <section className="flex flex-col gap-3 rounded-3xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-lg font-bold">📱 Il tuo dispositivo</h2>
        <p className="text-xs text-zinc-500">
          La collezione vive su questo browser. Per ritrovarla su un altro
          dispositivo, copia l&apos;ID e incollalo là sotto
          “Collega un altro dispositivo”.
        </p>
        {deviceId ? (
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all rounded-xl bg-zinc-100 px-3 py-2 text-xs dark:bg-zinc-800">
              {deviceId}
            </code>
            <button
              type="button"
              onClick={copyId}
              className="shrink-0 rounded-xl border border-zinc-300 px-3 py-2 text-xs font-semibold hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              {copied ? "Copiato! ✓" : "Copia"}
            </button>
          </div>
        ) : (
          <p className="text-xs text-amber-700 dark:text-amber-300">
            ID non ancora creato: premi + su una moneta o salva il profilo e
            apparirà qui.
          </p>
        )}
        <label className="flex flex-col gap-1 text-xs font-semibold">
          Collega un altro dispositivo (incolla qui il suo ID)
          <input
            value={importId}
            onChange={(e) => setImportId(e.target.value.trim())}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            aria-label="ID dispositivo da collegare"
            className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-xs outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-800"
          />
        </label>
        <button
          type="button"
          disabled={isPending || importId.trim().length === 0}
          onClick={doAdopt}
          className="rounded-xl border border-zinc-300 py-2 text-sm font-semibold hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          Collega
        </button>
      </section>
    </div>
  );
}
