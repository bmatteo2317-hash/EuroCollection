import ProfileForm from "@/components/ProfileForm";
import { getProfile } from "@/app/actions/profile";

// Pagina personale stile HOME-GYM: nome + ID dispositivo, niente login.
export const dynamic = "force-dynamic";

export default async function ProfiloPage() {
  const profile = await getProfile();

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6">
      <header className="text-center">
        <h1 className="text-3xl font-extrabold">
          {profile ? `Ciao, ${profile.displayName}! 🪙` : "Il tuo profilo 🪙"}
        </h1>
        <p className="mt-2 text-sm text-zinc-500">
          Niente email, niente password: la collezione è legata a questo
          dispositivo. Personalizza il nome e collegala dove vuoi.
        </p>
      </header>
      <ProfileForm
        initialName={profile?.displayName ?? "Collezionista"}
        deviceId={profile?.deviceId ?? null}
      />
    </div>
  );
}
