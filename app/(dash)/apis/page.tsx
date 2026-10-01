import { Stat } from "@/components/bento/stat";
import { Tile, Unavailable } from "@/components/bento/tile";
import { Lines } from "@/components/charts/lines";
import { getApis } from "@/lib/data/apis";
import { formatBytes, formatInt, formatParis, formatPct } from "@/lib/format";
import { parsePeriod } from "@/lib/period";
import { MODELS } from "@/lib/types";

const pct = (v: number | null) => (v == null ? "—" : `${(v * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`);

export default async function ApisPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const period = parsePeriod((await searchParams).period);
  const { label, derived, docErrors } = await getApis(period);
  if (!derived.ok) return <Tile tone="muted" title="IA & APIs"><Unavailable error={derived.error} /></Tile>;
  const d = derived.data;
  const p = d.probes[MODELS.primary];
  const quota = p?.limitRequests && p.remainingRequests != null ? 1 - p.remainingRequests / p.limitRequests : null;
  const sb = d.latestSupabase;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Tile tone="mint" title={`Disponibilité API Groq · ${label}`}><Stat value={pct(d.availability.api)} sub="GET /models, toutes les 5 min" /></Tile>
      <Tile tone="sky" title="Disponibilité gpt-oss-120b"><Stat value={pct(d.availability.primary)} sub="sonde toutes les 30 min" /></Tile>
      <Tile tone="blush" title="Disponibilité gpt-oss-20b"><Stat value={pct(d.availability.fallback)} sub="sonde toutes les heures" /></Tile>
      <Tile tone="sun" title="Quota Groq du jour (120b)">
        <Stat value={quota == null ? "—" : formatPct(quota)}
          sub={p?.remainingRequests != null ? `${formatInt(p.remainingRequests)} requêtes restantes · ${formatInt(p.limitTokens ?? 0)} tokens/min` : "aucune sonde récente"} />
      </Tile>

      <Tile className="sm:col-span-2 lg:col-span-4" title={`Latence Groq · ${label}`}>
        <Lines fmt="ms" data={d.latency}
          series={[
            { key: "api", label: "API (/models)", color: "#10b981" },
            { key: "primary", label: "gpt-oss-120b", color: "#7c3aed" },
            { key: "fallback", label: "gpt-oss-20b", color: "#db2777" },
          ]} />
      </Tile>

      <Tile className="sm:col-span-2 lg:col-span-3" title={`Base et stockage Noesis · ${label}`}>
        <Lines fmt="bytes" data={d.storage}
          series={[{ key: "db", label: "Base de données", color: "#7c3aed" }, { key: "storage", label: "Stockage", color: "#f59e0b" }]} />
        {sb && (
          <p className="mt-2 text-xs opacity-60">
            Limites du plan : base {formatBytes(sb.dbLimitBytes)} · stockage {formatBytes(sb.storageLimitBytes)} ·
            requêtes Supabase 24 h : {sb.apiRequests24h == null ? "—" : formatInt(sb.apiRequests24h)}
          </p>
        )}
      </Tile>

      <Tile tone={docErrors.ok ? (docErrors.data > 0 ? "blush" : "mint") : "muted"} title={`Documents en erreur · ${label}`}>
        {docErrors.ok ? <Stat value={formatInt(docErrors.data)} sub="imports PDF échoués" /> : <Unavailable error={docErrors.error} />}
      </Tile>

      <Tile tone="ink" className="sm:col-span-2 lg:col-span-4" title="Dernières erreurs de collecte">
        {d.collectErrors.length === 0 ? <p className="text-sm opacity-70">Aucune erreur sur la période ✨</p> : (
          <ul className="space-y-1.5 text-sm">
            {d.collectErrors.map((e) => (
              <li key={e.at} className="flex flex-wrap gap-x-3">
                <span className="opacity-60">{formatParis(e.at, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                {Object.entries(e.errors).map(([k, v]) => <span key={k}><b>{k}</b> : {v}</span>)}
              </li>
            ))}
          </ul>
        )}
      </Tile>
    </div>
  );
}
