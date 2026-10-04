"use server";

import { revalidatePath } from "next/cache";
import { sql, toActionError } from "@/lib/db";
import {
  adoptDeviceId as adoptDeviceIdInner,
  ensureDeviceUserId,
  getDeviceUserId,
  isValidDeviceId,
} from "@/lib/auth";
import { isValidCountry, type CountryCode } from "@/lib/catalog";
import {
  cleanDisplayName,
  DEFAULT_AVATAR,
  isValidAvatar,
  type AvatarChoice,
} from "@/lib/profile";
import type { ActionResult, VoidResult } from "@/lib/types";

export interface ProfileInfo {
  deviceId: string;
  displayName: string;
  avatar: AvatarChoice;
  country: CountryCode | null;
}

/** Profilo del dispositivo corrente (mai-throw: null se DB giù). */
export async function getProfile(): Promise<ProfileInfo | null> {
  try {
    const id = await getDeviceUserId();
    if (!id) return null;
    const rows = (await sql()`
      SELECT display_name, avatar, country FROM public.profiles WHERE id = ${id} LIMIT 1
    `) as unknown as {
      display_name: string;
      avatar: string | null;
      country: string | null;
    }[];
    const row = rows[0];
    if (!row) return { deviceId: id, displayName: "Collezionista", avatar: DEFAULT_AVATAR, country: null };
    return {
      deviceId: id,
      displayName: row.display_name || "Collezionista",
      avatar: isValidAvatar(row.avatar) ? row.avatar : DEFAULT_AVATAR,
      country:
        typeof row.country === "string" && isValidCountry(row.country)
          ? row.country
          : null,
    };
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

export interface SaveProfileInput {
  displayName: string;
  avatar: string;
  /** Codice paese del cuore, o "" per nessuno. */
  country: string;
}

/** Salva nome + avatar + paese (come il Profilo di HOME-GYM). */
export async function saveProfile(input: SaveProfileInput): Promise<VoidResult> {
  try {
    const clean = cleanDisplayName(input.displayName);
    if (!clean) {
      return { ok: false, error: "Il nome deve avere almeno 2 caratteri." };
    }
    const avatar = isValidAvatar(input.avatar) ? input.avatar : DEFAULT_AVATAR;
    const country =
      input.country && isValidCountry(input.country) ? input.country : null;
    const userId = await ensureDeviceUserId();
    await sql()`INSERT INTO public.profiles (id, display_name, avatar, country) VALUES (${userId}, ${clean}, ${avatar}, ${country}) ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, avatar = EXCLUDED.avatar, country = EXCLUDED.country`;
    revalidatePath("/");
    revalidatePath("/profilo");
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
