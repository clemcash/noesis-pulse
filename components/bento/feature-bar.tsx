import { formatInt, formatPct } from "@/lib/format";
import type { FeatureKey } from "@/lib/types";

export const FEATURE_LABEL: Record<FeatureKey, string> = { chat: "Chat", debates: "Débats", challenges: "Défis", documents: "Documents" };
export const FEATURE_COLOR: Record<FeatureKey, string> = { chat: "#7c3aed", debates: "#db2777", challenges: "#f59e0b", documents: "#10b981" };

export function FeatureBar({ counts }: { counts: { feature: FeatureKey; n: number }[] }) {
  const totals = new Map<FeatureKey, number>();
  for (const c of counts) totals.set(c.feature, (totals.get(c.feature) ?? 0) + c.n);
  const rows = [...totals.entries()].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  const sum = rows.reduce((a, [, n]) => a + n, 0);
  if (!sum) return <p className="text-sm opacity-60">Aucune activité sur la période.</p>;
  return (
    <div>
      <div className="my-3 flex h-5 overflow-hidden rounded-full">
        {rows.map(([f, n]) => (
          <span key={f} style={{ flex: n, background: FEATURE_COLOR[f] }} title={`${FEATURE_LABEL[f]} : ${formatInt(n)}`} />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {rows.map(([f, n]) => (
          <li key={f} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: FEATURE_COLOR[f] }} />
            {FEATURE_LABEL[f]} <b>{formatPct(n / sum)}</b> <span className="opacity-60">({formatInt(n)})</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
