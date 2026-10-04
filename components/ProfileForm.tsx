"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { adoptDevice, saveDisplayName } from "@/app/actions/profile";

export default function ProfileForm({
  initialName,
  deviceId,
}: {
  initialName: string;
  deviceId: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState(initialName);
  const [importId, setImportId] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const dirty = name.trim() !== initialName.trim();

  const save = (): void => {
    setErr(null);
    setMsg(null);
    startTransition(async () => {
      const res = await saveDisplayName(name);
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      setMsg("Nome salvato! 🎉");
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

      <section className="flex flex-col gap-3 rounded-3xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-lg font-bold">👤 Il tuo nome</h2>
        <p className="text-xs text-zinc-500">
          Come appari negli scambi con gli altri collezionisti.
        </p>
        <input
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, 40))}
          placeholder="es. Marco"
          maxLength={40}
          aria-label="Nome visualizzato"
          className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-800"
        />
        <button
          type="button"
          disabled={isPending || !dirty}
          onClick={save}
          className="rounded-xl bg-zinc-900 py-2 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {isPending ? "Salvataggio…" : "Salva nome"}
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
            ID non ancora creato: premi + su una moneta o salva il nome e
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
