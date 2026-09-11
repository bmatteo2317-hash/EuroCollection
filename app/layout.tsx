import type { Metadata } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";

export const metadata: Metadata = {
  title: "EuroCollection — Catalogo e collezione monete Euro",
  description:
    "Catalogo statico di tutte le monete euro (BCE) + collezione privata con Neon. Italia, Finlandia, Germania e tutta l'Eurozona.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="it" className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-zinc-50 text-zinc-900 dark:bg-black dark:text-zinc-100">
        <Navbar />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
          {children}
        </main>
        <footer className="border-t border-zinc-200 py-6 text-center text-xs text-zinc-500 dark:border-zinc-800">
          Dati e immagini: Banca Centrale Europea via{" "}
          <code>@euro-coins/source</code> · Collezione privata su Neon ·
          Deploy su Vercel
        </footer>
      </body>
    </html>
  );
}
