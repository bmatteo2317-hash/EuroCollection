"use server";

import { revalidatePath } from "next/cache";
import { sql, toActionError } from "@/lib/db";
import {
  adoptDeviceId as adoptDeviceIdInner,
  ensureDeviceUserId,
  getDeviceUserId,
  isValidDeviceId,
} from "@/lib/auth";
import type { ActionResult, VoidResult } from "@/lib/types";

export interface ProfileInfo {
  deviceId: string;
  displayName: string;
}

/** Profilo del dispositivo corrente (mai-throw: null se DB giù). */
export async function getProfile(): Promise<ProfileInfo | null> {
  try {
    const id = await getDeviceUserId();
    if (!id) return null;
    const rows = (await sql()`
      SELECT display_name FROM public.profiles WHERE id = ${id} LIMIT 1
    `) as unknown as { display_name: string }[];
    return { deviceId: id, displayName: rows[0]?.display_name ?? "Collezionista" };
  } catch (e) {
    console.error("[profile] lettura fallita:", e);
    return null;
  }
}

/** Nome visualizzato del dispositivo corrente (per la Navbar). */
export async function getDisplayName(): Promise<string | null> {
  const p = await getProfile();
  return p?.displayName ?? null;
}

function cleanName(name: string): string | null {
  const t = name.trim().replace(/\s+/g, " ").slice(0, 40);
  if (t.length < 2) return null;
  return t;
}

/** Salva il nome visualizzato (come il Profilo di HOME-GYM). */
export async function saveDisplayName(name: string): Promise<VoidResult> {
  try {
    const clean = cleanName(name);
    if (!clean) {
      return { ok: false, error: "Il nome deve avere almeno 2 caratteri." };
    }
    const userId = await ensureDeviceUserId();
    await sql()`INSERT INTO public.profiles (id, display_name) VALUES (${userId}, ${clean}) ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name`;
    revalidatePath("/");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: toActionError(e) };
  }
}

/** Collega questo browser a un account esistente (ID da altro dispositivo). */
export async function adoptDevice(
  id: string
): Promise<ActionResult<{ deviceId: string }>> {
  try {
    const clean = id.trim();
    if (!isValidDeviceId(clean)) {
      return { ok: false, error: "ID non valido: incolla l'ID completo mostrato sull'altro dispositivo." };
    }
    const ok = await adoptDeviceIdInner(clean);
    if (!ok) return { ok: false, error: "Collegamento fallito: database non disponibile." };
    revalidatePath("/");
    revalidatePath("/collezione");
    return { ok: true, deviceId: clean };
  } catch (e) {
    return { ok: false, error: toActionError(e) };
  }
}
