import { NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { EmailOtpType } from "@supabase/supabase-js";
import { cookies } from "next/headers";

// Callback auth: Supabase rimanda qui in due formati diversi.
// - /auth/callback?code=... → flusso PKCE (magic link recenti)
// - /auth/callback?token_hash=...&type=signup → conferma registrazione,
//   invite, recovery password, cambio email, magic link legacy
// Gestire SOLO `code` faceva fallire tutti i link di verifica email
// (redirect a /login?error=auth).
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const next = url.searchParams.get("next") ?? "/collezione";

  const redirectTo = (path: string) => {
    // Dietro proxy (Vercel) l'origin della request è interno:
    // si usa l'host originale per non rompere il redirect.
    const forwardedHost = request.headers.get("x-forwarded-host");
    if (process.env.NODE_ENV !== "development" && forwardedHost) {
      return NextResponse.redirect(`https://${forwardedHost}${path}`);
    }
    return NextResponse.redirect(`${url.origin}${path}`);
  };

  if (code || (tokenHash && type)) {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(
            cookiesToSet: {
              name: string;
              value: string;
              options: CookieOptions;
            }[]
          ) {
            try {
              // Nelle Route Handler .set() è permesso: Next allega i
              // Set-Cookie alla response di redirect qui sotto.
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch {
              // Ignora: senza sessione si finisce su /login?error=auth
            }
          },
        },
      }
    );

    const { error } = code
      ? await supabase.auth.exchangeCodeForSession(code)
      : await supabase.auth.verifyOtp({
          token_hash: tokenHash as string,
          type: type as EmailOtpType,
        });

    if (!error) return redirectTo(next);
  }

  return redirectTo("/login?error=auth");
}
