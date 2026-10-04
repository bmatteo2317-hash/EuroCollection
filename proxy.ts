// Su Neon non c'è una sessione Supabase da rinfrescare via middleware:
// l'autenticazione è un cookie JWT httpOnly letto nei Server Component
// e nelle Server Action (lib/auth.ts). Questo proxy resta come no-op
// per future esigenze (redirect, header di sicurezza).
import { NextResponse } from "next/server";

export default async function proxy() {
  return NextResponse.next();
}

export const config = {
  matcher: [],
};
