import { redirect } from "next/navigation";
import AuthForm from "@/components/AuthForm";
import { getSessionUser } from "@/lib/auth";

// Legge la sessione via cookies(): rendering dinamico, mai prerender in build.
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  // redirect() lancia un'eccezione speciale NEXT_REDIRECT: NON va mai
  // messo dentro try/catch (verrebbe inghiottito e il redirect non avviene).
  const user = await getSessionUser().catch(() => null);
  if (user) redirect("/collezione");

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
