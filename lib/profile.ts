/**
 * Costanti condivise del profilo (client + server): niente dipendenze
 * pesanti qui dentro, così ProfileForm può importarle senza appesantire
 * il bundle (lib/catalog.ts trascinerebbe tutto il dataset delle monete).
 */

export const AVATAR_CHOICES = [
  "🪙",
  "👑",
  "🦁",
  "🦅",
  "🐂",
  "🌟",
  "💎",
  "🏛️",
  "🚀",
  "🍀",
  "⚓",
  "🦉",
] as const;

export type AvatarChoice = (typeof AVATAR_CHOICES)[number];

export const DEFAULT_AVATAR: AvatarChoice = "🪙";

export function isValidAvatar(value: unknown): value is AvatarChoice {
  return (
    typeof value === "string" &&
    (AVATAR_CHOICES as readonly string[]).includes(value)
  );
}

export function cleanDisplayName(name: string): string | null {
  const t = name.trim().replace(/\s+/g, " ").slice(0, 40);
  return t.length >= 2 ? t : null;
}
