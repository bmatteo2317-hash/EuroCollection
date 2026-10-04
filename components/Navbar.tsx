import Link from "next/link";
import { getDisplayName } from "@/app/actions/profile";

export default async function Navbar() {
  // Mai far crashare il layout: senza nome si mostra "Profilo".
  let name: string | null = null;
  try {
    name = await getDisplayName();
  } catch {
    name = null;
  }

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-black/60">
      <nav className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-1 px-3 sm:px-4">
        <Link href="/" className="shrink-0 text-base font-extrabold tracking-tight sm:text-lg">
          🪙 Euro<span className="hidden min-[420px]:inline">Collection</span>
        </Link>
        <div className="flex items-center gap-0.5 text-xs sm:gap-2 sm:text-sm">
          <Link
            href="/"
            className="rounded-full px-2 py-1.5 hover:bg-zinc-100 sm:px-3 dark:hover:bg-zinc-800"
          >
            Catalogo
          </Link>
          <Link
            href="/collezione"
            className="rounded-full px-2 py-1.5 hover:bg-zinc-100 sm:px-3 dark:hover:bg-zinc-800"
          >
            <span className="hidden min-[420px]:inline">La mia collezione</span>
            <span className="min-[420px]:hidden">Collezione</span>
          </Link>
          <Link
            href="/scambi"
            className="rounded-full px-2 py-1.5 hover:bg-zinc-100 sm:px-3 dark:hover:bg-zinc-800"
          >
            Scambi
          </Link>
          <Link
            href="/profilo"
            className="max-w-24 truncate rounded-full bg-zinc-900 px-2.5 py-1.5 font-medium text-white sm:max-w-none sm:px-3 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {name ? `👤 ${name}` : "👤 Profilo"}
          </Link>
        </div>
      </nav>
    </header>
  );
}
