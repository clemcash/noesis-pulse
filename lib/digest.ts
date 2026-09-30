import { RULE_META } from "@/lib/alerts/rules";
import { formatInt, formatParis, formatPct } from "@/lib/format";
import type { DaySummary } from "@/lib/noesis/queries";
import { pctChange } from "@/lib/stats";
import type { Alert } from "@/lib/types";

export type DigestData = {
  day: Date;
  summary: DaySummary | null;
  peak: { value: number; at: string } | null;
  groqAvailability: number | null;
  alerts: Alert[];
  unavailable: string[];
};

function trend(cur: number, prev: number): string {
  const c = pctChange(cur, prev);
  if (c == null) return "";
  const arrow = c >= 0 ? "▲" : "▼";
  return ` (${arrow} ${formatPct(Math.abs(c))} vs veille)`;
}

export function buildDigest(d: DigestData): string {
  const lines = [`☀️ Noesis — résumé du ${formatParis(d.day.toISOString(), { weekday: "long", day: "numeric", month: "long" })}`];
  if (d.summary) {
    lines.push(
      `👥 Nouveaux inscrits : ${formatInt(d.summary.newUsers)}`,
      `🟢 Actifs : ${formatInt(d.summary.active)}`,
      `🤖 Demandes IA : ${formatInt(d.summary.ai)}${trend(d.summary.ai, d.summary.aiPrev)}`,
    );
  } else {
    lines.push("👥 Activité : indisponible");
  }
  lines.push(
    d.peak
      ? `📈 Pic en ligne : ${d.peak.value} à ${formatParis(d.peak.at, { hour: "2-digit", minute: "2-digit" })}`
      : "📈 Pic en ligne : —",
  );
  lines.push(
    d.groqAvailability == null
      ? "⚡ Disponibilité API Groq : —"
      : `⚡ Disponibilité API Groq : ${(d.groqAvailability * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`,
  );
  lines.push(
    d.alerts.length
      ? `🚨 Alertes : ${d.alerts.length} (${d.alerts.map((a) => RULE_META[a.rule_key].label).join(", ")})`
      : "✅ Aucune alerte",
  );
  if (d.unavailable.length) lines.push(`⚠️ Données indisponibles : ${d.unavailable.join(", ")}`);
  return lines.join("\n");
}
