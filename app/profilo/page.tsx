import ProfileForm from "@/components/ProfileForm";
import { getProfile } from "@/app/actions/profile";
import { COUNTRIES, COUNTRY_FLAGS, COUNTRY_NAMES } from "@/lib/catalog";

// Pagina personale stile HOME-GYM: avatar, nome, paese + ID dispositivo.
export const dynamic = "force-dynamic";

export default async function ProfiloPage() {
  const profile = await getProfile();
  const countries = COUNTRIES.map((code) => ({
    code,
    name: COUNTRY_NAMES[code] ?? code.toUpperCase(),
    flag: COUNTRY_FLAGS[code] ?? "🇪🇺",
  })).sort((a, b) => a.name.localeCompare(b.name, "it"));

  const avatar = profile?.avatar ?? "🪙";
  const name = profile?.displayName ?? "Collezionista";

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6">
      <header className="text-center">
        <div className="text-6xl" aria-hidden="true">
          {avatar}
        </div>
        <h1 className="mt-2 text-3xl font-extrabold">
          {profile ? `Ciao, ${name}!` : "Il tuo profilo 🪙"}
        </h1>
        <p className="mt-2 text-sm text-zinc-500">
          Niente email, niente password: la collezione è legata a questo
          dispositivo. Personalizza il tuo collezionista.
        </p>
      </header>
      <ProfileForm
        initialName={name}
        initialAvatar={avatar}
        initialCountry={profile?.country ?? ""}
        countries={countries}
        deviceId={profile?.deviceId ?? null}
      />
    </div>
  );
}
