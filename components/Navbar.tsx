import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function Navbar() {
  // Mai far crashare il layout (e quindi la build/prerender Next):
  // senza env Supabase o senza sessione si mostra la versione guest.
  let user: { id: string } | null = null;
  try {
    const supabase = await createClient();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    user = authUser;
  } catch {
    user = null;
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
          {user ? (
            <form
              action={async () => {
                "use server";
                const { createClient } = await import(
                  "@/lib/supabase/server"
                );
                const supabase = await createClient();
                await supabase.auth.signOut();
                redirect("/login");
              }}
            >
              <button className="rounded-full bg-zinc-900 px-3 py-1.5 font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">
                Esci
              </button>
            </form>
          ) : (
            <Link
              href="/login"
              className="rounded-full bg-zinc-900 px-3 py-1.5 font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
            >
              Accedi
            </Link>
          )}
        </div>
      </nav>
    </header>
  );
}
