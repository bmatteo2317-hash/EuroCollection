"use server";

import { redirect } from "next/navigation";
import {
  destroySession,
  signInWithPassword,
  signUpWithPassword,
} from "@/lib/auth";

export async function signUpAction(email: string, password: string): Promise<void> {
  await signUpWithPassword(email, password);
  redirect("/");
}

export async function signInAction(email: string, password: string): Promise<void> {
  await signInWithPassword(email, password);
  redirect("/");
}

export async function signOutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}
