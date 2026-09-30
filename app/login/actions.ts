"use server";

import { headers } from "next/headers";
import { isAllowedEmail } from "@/lib/auth/allowed";
import { env } from "@/lib/env";
import { supabaseServer } from "@/lib/supabase/server";

export type LoginState = { sent: boolean };

/** Réponse identique que l'email soit autorisé ou non (on ne révèle rien). */
export async function sendMagicLink(_prev: LoginState, fd: FormData): Promise<LoginState> {
  const email = String(fd.get("email") ?? "").trim();
  if (isAllowedEmail(email, env.allowedEmail)) {
    const h = await headers();
    const origin = (process.env.SITE_URL || h.get("origin") || "http://localhost:3020").replace(/\/+$/, "");
    const sb = await supabaseServer();
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false, emailRedirectTo: `${origin}/auth/callback` },
    });
    if (error) console.error("[login] envoi du lien :", error.message);
  }
  return { sent: true };
}
