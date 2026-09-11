import { redirect } from "next/navigation";
import AuthForm from "@/components/AuthForm";
import { getSessionUser } from "@/lib/auth";

// Legge la sessione via cookies(): rendering dinamico, mai prerender in build.
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  try {
    const user = await getSessionUser();
    if (user) redirect("/collezione");
  } catch {
    // Sessione illeggibile: mostra comunque il form di login.
  }

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-6 py-10">
      <div className="text-center">
        <h1 className="text-3xl font-extrabold">Accedi 🪙</h1>
        <p className="mt-2 text-sm text-zinc-500">
          Salva la tua collezione su Neon. Accedi con email + password
          oppure crea un nuovo account.
        </p>
      </div>
      <AuthForm />
    </div>
  );
}
