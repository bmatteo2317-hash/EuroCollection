"use client";

import { useEffect } from "react";

/**
 * Registra il service worker (/sw.js) solo in produzione: in locale
 * resterebbe in mezzo con cache vecchie durante lo sviluppo.
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    const url = "/sw.js";
    const register = (): void => {
      navigator.serviceWorker.register(url).catch((e) => {
        console.warn("[pwa] registrazione SW fallita:", e);
      });
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);

  return null;
}
