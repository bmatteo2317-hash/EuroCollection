"use client";

import Image from "next/image";
import { useState } from "react";
import {
  COUNTRY_FLAGS,
  countryFlagUrl,
  type CountryCode,
} from "@/lib/catalog";

interface Props {
  code: CountryCode;
  /** Nome paese per l'alt text (default: codice). */
  name?: string;
  /** Larghezza in px (l'altezza segue il rapporto ~4:3). */
  size?: number;
}

/**
 * Bandiera del paese come immagine (visibile anche su Windows, dove le
 * emoji bandiera non esistono e mostrerebbero "IT", "DE", ...).
 * Se l'immagine non carica, fallback all'emoji.
 */
export default function CountryFlag({ code, name, size = 28 }: Props) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <span style={{ fontSize: Math.round(size * 0.9) }} aria-hidden="true">
        {COUNTRY_FLAGS[code] ?? "🇪🇺"}
      </span>
    );
  }

  return (
    <Image
      src={countryFlagUrl(code)}
      alt={`Bandiera ${name ?? code.toUpperCase()}`}
      width={size}
      height={Math.round((size * 3) / 4)}
      onError={() => setFailed(true)}
      className="rounded-[3px] object-cover shadow-sm"
    />
  );
}
