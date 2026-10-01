import Link from "next/link";
import { notFound } from "next/navigation";
import { FeatureBar } from "@/components/bento/feature-bar";
import { Stat } from "@/components/bento/stat";
import { Tile, Unavailable } from "@/components/bento/tile";
import { Lines } from "@/components/charts/lines";
import { getUserDetail } from "@/lib/data/users";
import { formatInt, formatParis, timeAgo } from "@/lib/format";

export default async function UserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await getUserDetail(id);
  if (!res.ok) return <Tile tone="muted"><Unavailable error={res.error} /></Tile>;
  if (!res.data) notFound();
  const { user, daily, features, skills, documents } = res.data;
  const date = (iso: string | null) => (iso ? formatParis(iso, { day: "numeric", month: "long", year: "numeric" }) : "—");

  return (
    <div className="space-y-3">
      <Link href="/users" className="text-sm hover:underline">← Tous les utilisateurs</Link>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile tone="hero" className="sm:col-span-2" title="Utilisateur">
          <div className="break-all text-2xl font-bold">{user.email}</div>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <dt className="opacity-75">Inscrit le</dt><dd>{date(user.createdAt)}</dd>
            <dt className="opacity-75">Dernière connexion</dt><dd>{date(user.lastSignInAt)}</dd>
            <dt className="opacity-75">Dernière activité</dt><dd suppressHydrationWarning>{user.lastActivity ? timeAgo(user.lastActivity) : "—"}</dd>
          </dl>
        </Tile>
        <Tile tone="sun" title="Demandes IA"><Stat value={formatInt(user.aiRequests)} sub="depuis l'inscription" /></Tile>
        <Tile tone="mint" title="Documents"><Stat value={formatInt(documents)} /></Tile>
        <Tile className="sm:col-span-2 lg:col-span-3" title="Activité · 30 jours">
          <Lines fmt="int" data={daily.map((d) => ({ t: Date.parse(d.day), actions: d.actions, ai: d.ai }))}
            series={[{ key: "actions", label: "Actions", color: "#7c3aed" }, { key: "ai", label: "Réponses IA", color: "#db2777" }]} />
        </Tile>
        <Tile title="Fonctionnalités"><FeatureBar counts={features} /></Tile>
        <Tile tone="sky" className="sm:col-span-2 lg:col-span-4" title="Compétences (score moyen)">
          {skills.length === 0 ? <p className="text-sm opacity-60">Aucune compétence mesurée.</p> : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {skills.map((s) => (
                <li key={s.skill}>
                  <div className="mb-1 flex justify-between text-sm"><span className="capitalize">{s.skill}</span><b>{s.avg}/100 <span className="font-normal opacity-60">({s.n})</span></b></div>
                  <div className="h-2.5 rounded-full bg-white/70"><div className="h-2.5 rounded-full bg-ink" style={{ width: `${s.avg}%` }} /></div>
                </li>
              ))}
            </ul>
          )}
        </Tile>
      </div>
    </div>
  );
}
