import { redirect } from "next/navigation";
import AuthForm from "@/components/AuthForm";
import { createClient } from "@/lib/supabase/server";

// Legge la sessione via cookies(): rendering dinamico, mai prerender in build.
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) redirect("/collezione");
  } catch {
    // Env assenti o sessione illeggibile: mostra comunque il form di login.
  }

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-6 py-10">
      <div className="text-center">
        <h1 className="text-3xl font-extrabold">Accedi 🪙</h1>
        <p className="mt-2 text-sm text-zinc-500">
          Salva la tua collezione su Supabase. Puoi usare email + password
          oppure ricevere un magic link.
        </p>
      </div>
      <AuthForm />
      <p className="text-xs text-zinc-400">
        Configura l&apos;URL di redirect in Supabase → Authentication → URL
        Configuration: aggiungi{" "}
        <code>https://tuo-dominio.vercel.app/**</code> e{" "}
        <code>http://localhost:3000/**</code>.
      </p>
    </div>
  );
}
