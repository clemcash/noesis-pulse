import Link from "next/link";
import { FeatureBar } from "@/components/bento/feature-bar";
import { HealthRow, latencyHealth, ratioHealth } from "@/components/bento/health-row";
import { Stat } from "@/components/bento/stat";
import { Tile, Unavailable } from "@/components/bento/tile";
import { AreaSpark } from "@/components/charts/area-spark";
import { Bars } from "@/components/charts/bars";
import { getOverview } from "@/lib/data/overview";
import { formatBytes, formatInt, formatParis, formatPct, maskEmail, timeAgo } from "@/lib/format";
import { parsePeriod } from "@/lib/period";
import { pctChange, perHour } from "@/lib/stats";
import { MODELS } from "@/lib/types";

function Trend({ cur, prev }: { cur: number; prev: number }) {
  const c = pctChange(cur, prev);
  if (c == null) return null;
  return <span className="font-semibold">{c >= 0 ? "▲" : "▼"} {formatPct(Math.abs(c))}</span>;
}

export default async function OverviewPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const period = parsePeriod((await searchParams).period);
  const d = await getOverview(period);
  const { snaps, kpis, series, byFeature, signups } = d;
  const last = snaps.ok ? snaps.data.last : null;
  const primary = snaps.ok ? snaps.data.probes[MODELS.primary] : null;
  const fallback = snaps.ok ? snaps.data.probes[MODELS.fallback] : null;
  const quotaUsed = primary?.limitRequests && primary.remainingRequests != null ? 1 - primary.remainingRequests / primary.limitRequests : null;
  const sb = last?.supabase ?? null;

  return (
    <div className="grid auto-rows-[minmax(130px,auto)] grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {/* En ligne */}
      <Tile tone={snaps.ok && last?.online != null ? "hero" : "muted"} className="lg:row-span-2" title="En ligne maintenant · estimation">
        {snaps.ok && last?.online != null ? (
          <>
            <Stat size="xl" pulse value={formatInt(last.online)}
              sub={snaps.data.peakToday ? `pic du jour : ${snaps.data.peakToday.value} à ${formatParis(snaps.data.peakToday.at, { hour: "2-digit", minute: "2-digit" })}` : "pas encore de pic aujourd'hui"} />
            <div className="mt-6">
              <AreaSpark data={snaps.data.online} />
            </div>
          </>
        ) : (
          <Unavailable error={snaps.ok ? "Aucun relevé récent" : snaps.error} />
        )}
      </Tile>

      {/* Demandes IA */}
      <Tile tone={kpis.ok ? "sun" : "muted"} title={`Demandes IA · ${d.label}`}>
        {kpis.ok ? (
          <Stat value={formatInt(kpis.data.aiCount)}
            sub={<>≈ {formatInt(perHour(kpis.data.aiCount, d.hours))} / h · <Trend cur={kpis.data.aiCount} prev={kpis.data.aiPrev} /></>} />
        ) : <Unavailable error={kpis.error} />}
      </Tile>

      {/* Utilisateurs */}
      <Tile tone={kpis.ok ? "mint" : "muted"} title="Utilisateurs">
        {kpis.ok ? <Stat value={formatInt(kpis.data.usersTotal)} sub={`+${formatInt(kpis.data.usersNew)} sur ${d.label}`} /> : <Unavailable error={kpis.error} />}
      </Tile>

      {/* Actifs */}
      <Tile tone={kpis.ok ? "sky" : "muted"} title="Actifs 7 jours">
        {kpis.ok ? (
          <Stat value={formatInt(kpis.data.active7d)}
            sub={`${kpis.data.usersTotal ? formatPct(kpis.data.active7d / kpis.data.usersTotal) : "—"} des inscrits · ${formatInt(kpis.data.activePeriod)} sur ${d.label}`} />
        ) : <Unavailable error={kpis.error} />}
      </Tile>

      {/* Histogramme */}
      <Tile tone={series.ok ? "white" : "muted"} className="sm:col-span-2 lg:col-span-3" title={`Demandes IA par ${d.bucket === "hour" ? "heure" : "jour"} · ${d.label}`}>
        {series.ok ? <Bars bucket={d.bucket} data={series.data.map((p) => ({ t: Date.parse(p.t), n: p.n }))} /> : <Unavailable error={series.error} />}
      </Tile>

      {/* Santé */}
      <Tile tone="ink" className="lg:row-span-2" title={<Link href="/apis" className="hover:underline">Santé des APIs →</Link>}>
        {snaps.ok ? (
          <div className="mt-1">
            <HealthRow label="API Groq" value={last?.groq?.api.ok ? `${last.groq.api.latencyMs} ms` : last?.groq ? "KO" : "—"}
              status={last?.groq ? latencyHealth(last.groq.api.latencyMs, last.groq.api.ok) : "unknown"} />
            <HealthRow label="gpt-oss-120b" value={primary ? (primary.ok ? `${primary.latencyMs} ms` : "échec") : "—"}
              status={primary ? latencyHealth(primary.latencyMs, primary.ok) : "unknown"} />
            <HealthRow label="gpt-oss-20b" value={fallback ? (fallback.ok ? `${fallback.latencyMs} ms` : "échec") : "—"}
              status={fallback ? latencyHealth(fallback.latencyMs, fallback.ok) : "unknown"} />
            <HealthRow label="Quota Groq / jour" value={quotaUsed == null ? "—" : `${formatPct(quotaUsed)} utilisé`} status={ratioHealth(quotaUsed)} />
            <HealthRow label="Requêtes Supabase 24 h" value={sb?.apiRequests24h == null ? "—" : formatInt(sb.apiRequests24h)} status={sb?.apiRequests24h == null ? "unknown" : "ok"} />
            <HealthRow label="Base de données" value={sb ? `${formatBytes(sb.dbBytes)} / ${formatBytes(sb.dbLimitBytes)}` : "—"}
              status={ratioHealth(sb ? sb.dbBytes / sb.dbLimitBytes : null)} />
            <HealthRow label="Stockage" value={sb ? `${formatBytes(sb.storageBytes)} / ${formatBytes(sb.storageLimitBytes)}` : "—"}
              status={ratioHealth(sb ? sb.storageBytes / sb.storageLimitBytes : null)} />
            {last?.errors && <p className="mt-3 text-xs text-bad">⚠ {Object.keys(last.errors).length} source(s) en erreur au dernier relevé</p>}
          </div>
        ) : <Unavailable error={snaps.error} />}
      </Tile>

      {/* Répartition */}
      <Tile tone={byFeature.ok ? "white" : "muted"} className="sm:col-span-2" title={`Par fonctionnalité · ${d.label}`}>
        {byFeature.ok ? <FeatureBar counts={byFeature.data} /> : <Unavailable error={byFeature.error} />}
      </Tile>

      {/* Derniers inscrits */}
      <Tile tone={signups.ok ? "blush" : "muted"} title="Derniers inscrits">
        {signups.ok ? (
          <ul className="space-y-1 text-sm">
            {signups.data.map((s) => (
              <li key={s.id} className="flex justify-between gap-2">
                <Link href={`/users/${s.id}`} className="truncate hover:underline">{maskEmail(s.email)}</Link>
                <span className="shrink-0 opacity-60" suppressHydrationWarning>{timeAgo(s.createdAt)}</span>
              </li>
            ))}
          </ul>
        ) : <Unavailable error={signups.error} />}
      </Tile>
    </div>
  );
}
