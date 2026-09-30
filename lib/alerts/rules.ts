import { formatBytes, formatPct } from "@/lib/format";
import { parisHour } from "@/lib/time";
import { MODELS } from "@/lib/types";
import type { Alert, AlertRule, GroqModelProbe, RuleKey, Snapshot } from "@/lib/types";

export type RuleContext = {
  now: Date;
  latest: Snapshot | null;
  previous: Snapshot | null;
  probes: Record<string, GroqModelProbe | null>;
  ai2h: number | null;
  ai2hLastWeek: number | null;
  lastSnapshotAt: string | null;
};

export type RuleResult = { firing: boolean; message: string };

export const RULE_META: Record<RuleKey, { label: string; unit: "none" | "ms" | "ratio" | "count" | "min"; help: string }> = {
  groq_down: { label: "Groq en panne", unit: "none", help: "API Groq KO sur 2 relevés, ou dernière sonde gpt-oss-120b en échec" },
  groq_slow: { label: "Groq lent", unit: "ms", help: "Dernière sonde gpt-oss-120b plus lente que le seuil (ms)" },
  groq_quota: { label: "Quota Groq", unit: "ratio", help: "Part du quota journalier de requêtes consommée (0 à 1)" },
  supabase_db: { label: "Base Noesis pleine", unit: "ratio", help: "Taille de la base / limite du plan (0 à 1)" },
  supabase_storage: { label: "Stockage Noesis plein", unit: "ratio", help: "Stockage / limite du plan (0 à 1)" },
  activity_drop: { label: "Chute d'activité", unit: "count", help: "Demandes IA sur 2 h ≤ seuil, entre 8h et 23h, alors que J-7 en comptait au moins 5" },
  collector_stale: { label: "Collecteur arrêté", unit: "min", help: "Minutes sans nouveau relevé" },
};

const quiet: RuleResult = { firing: false, message: "" };
const fire = (message: string): RuleResult => ({ firing: true, message });
const shortName = (model: string) => model.replace(/^openai\//, "");
const seconds = (ms: number) => `${(ms / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} s`;

export function checkRule(rule: AlertRule, ctx: RuleContext): RuleResult {
  const t = rule.threshold;
  const primary = ctx.probes[MODELS.primary] ?? null;

  switch (rule.key) {
    case "groq_down": {
      const a = ctx.latest?.groq?.api;
      const b = ctx.previous?.groq?.api;
      if (a && b && !a.ok && !b.ok) return fire(`🔴 API Groq injoignable depuis 2 relevés (${a.error ?? "erreur"})`);
      if (primary && !primary.ok) return fire(`🔴 Groq ${shortName(MODELS.primary)} en échec : ${primary.error ?? "erreur"}`);
      return quiet;
    }
    case "groq_slow": {
      if (primary?.ok && primary.latencyMs != null && primary.latencyMs > t) {
        return fire(`🐢 Groq ${shortName(MODELS.primary)} lent : ${seconds(primary.latencyMs)} (seuil ${seconds(t)})`);
      }
      return quiet;
    }
    case "groq_quota": {
      if (!primary || !primary.limitRequests || primary.remainingRequests == null) return quiet;
      const used = 1 - primary.remainingRequests / primary.limitRequests;
      return used > t ? fire(`⚠️ Quota Groq du jour consommé à ${formatPct(used)} (${primary.remainingRequests} requêtes restantes)`) : quiet;
    }
    case "supabase_db":
    case "supabase_storage": {
      const s = ctx.latest?.supabase;
      if (!s) return quiet;
      const isDb = rule.key === "supabase_db";
      const used = isDb ? s.dbBytes : s.storageBytes;
      const limit = isDb ? s.dbLimitBytes : s.storageLimitBytes;
      if (!limit) return quiet;
      const ratio = used / limit;
      const what = isDb ? "Base Noesis" : "Stockage Noesis";
      return ratio > t ? fire(`⚠️ ${what} à ${formatPct(ratio)} (${formatBytes(used)} / ${formatBytes(limit)})`) : quiet;
    }
    case "activity_drop": {
      const h = parisHour(ctx.now);
      const start = rule.params.startHour ?? 8;
      const end = rule.params.endHour ?? 23;
      const minLastWeek = rule.params.minLastWeek ?? 5;
      if (h < start || h >= end || ctx.ai2h == null || ctx.ai2hLastWeek == null) return quiet;
      if (ctx.ai2h <= t && ctx.ai2hLastWeek >= minLastWeek) {
        return fire(`📉 ${ctx.ai2h} demande IA en 2 h (${ctx.ai2hLastWeek} la semaine dernière à la même heure)`);
      }
      return quiet;
    }
    case "collector_stale": {
      if (!ctx.lastSnapshotAt) return fire("⏱️ Aucun relevé enregistré");
      const ageMin = (ctx.now.getTime() - new Date(ctx.lastSnapshotAt).getTime()) / 60000;
      return ageMin > t ? fire(`⏱️ Aucun relevé depuis ${Math.round(ageMin)} min`) : quiet;
    }
  }
}

export function diffAlerts(rules: AlertRule[], ctx: RuleContext, open: Alert[]) {
  const toOpen: { rule_key: RuleKey; message: string }[] = [];
  const toResolve: { alert: Alert; message: string }[] = [];
  for (const rule of rules) {
    if (!rule.enabled) continue;
    const res = checkRule(rule, ctx);
    const current = open.find((a) => a.rule_key === rule.key);
    if (res.firing && !current) toOpen.push({ rule_key: rule.key, message: res.message });
    if (!res.firing && current) toResolve.push({ alert: current, message: `✅ Résolu : ${RULE_META[rule.key].label}` });
  }
  return { toOpen, toResolve };
}
