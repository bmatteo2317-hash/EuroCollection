import type { MetadataRoute } from "next";

/**
 * Web App Manifest: rende EuroCollection installabile come app
 * ("Aggiungi a schermata Home" su Android/iOS). Servito da Next come
 * /manifest.webmanifest e collegato in automatico nel <head>.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "EuroCollection — Monete Euro",
    short_name: "EuroCollection",
    description:
      "Catalogo di tutte le monete euro con immagini BCE + la tua collezione privata.",
    lang: "it",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#09090b",
    theme_color: "#09090b",
    categories: ["lifestyle", "finance", "collecting"],
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
