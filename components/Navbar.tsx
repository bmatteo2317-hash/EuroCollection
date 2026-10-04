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
      <nav className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="text-lg font-extrabold tracking-tight">
          🪙 EuroCollection
        </Link>
        <div className="flex items-center gap-2 text-sm">
          <Link
            href="/"
            className="rounded-full px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            Catalogo
          </Link>
          <Link
            href="/collezione"
            className="rounded-full px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            La mia collezione
          </Link>
          <Link
            href="/scambi"
            className="rounded-full px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            Scambi
          </Link>
          <Link
            href="/profilo"
            className="rounded-full bg-zinc-900 px-3 py-1.5 font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            {name ? `👤 ${name}` : "👤 Profilo"}
          </Link>
        </div>
      </nav>
    </header>
  );
}
