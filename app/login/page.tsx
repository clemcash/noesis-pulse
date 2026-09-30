import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { isDemo } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ erreur?: string }> }) {
  if (isDemo()) redirect("/");
  const { erreur } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-3xl bg-white p-8 shadow-sm">
        <div className="mb-6 flex items-center gap-2 text-lg font-bold">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet to-rose text-white">◆</span>
          Noesis Pulse
        </div>
        <h1 className="mb-1 text-xl font-bold">Connexion</h1>
        <p className="mb-6 text-sm text-ink/60">Espace privé. On t&apos;envoie un lien par email.</p>
        {erreur && <p className="mb-4 rounded-xl bg-blush p-3 text-sm">Lien invalide ou expiré, recommence.</p>}
        <LoginForm />
      </div>
    </main>
  );
}
