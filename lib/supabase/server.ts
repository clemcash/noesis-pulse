import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isAllowedEmail } from "@/lib/auth/allowed";
import { env, isDemo, isLocal } from "@/lib/env";

export async function supabaseServer() {
  const store = await cookies();
  return createServerClient(env.pulseUrl, env.pulseAnonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          /* appelé depuis un Server Component : le proxy rafraîchit la session */
        }
      },
    },
  });
}

/** À appeler en tête de chaque layout/page/server action protégé. */
export async function requireUser(): Promise<{ email: string }> {
  if (isDemo()) return { email: "demo@local" };
  if (isLocal()) return { email: "local" };
  const sb = await supabaseServer();
  const { data } = await sb.auth.getUser();
  const email = data.user?.email ?? "";
  if (!isAllowedEmail(email, env.allowedEmail)) redirect("/login");
  return { email };
}
