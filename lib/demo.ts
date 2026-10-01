import { deriveApis, deriveOverviewSnaps } from "@/lib/data/derive";
import type { AlertsPageData, ApisData, OverviewData } from "@/lib/data/types";
import type { FeatureCount, SeriesPoint, UserDetail, UserRow } from "@/lib/noesis/queries";
import { periodRange } from "@/lib/period";
import { parisHour } from "@/lib/time";
import { MODELS } from "@/lib/types";
import type { Alert, AlertRule, FeatureKey, GroqModelProbe, Period, Snapshot } from "@/lib/types";

const STEP = 5 * 60_000;
const MB = 1024 * 1024;

function rng(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Courbe d'activité d'une journée : creux la nuit, pic en soirée. */
function activity(d: Date): number {
  const h = parisHour(d) + d.getUTCMinutes() / 60;
  return h < 7 ? 0.05 : Math.max(0.05, Math.sin(((h - 7) / 16) * Math.PI));
}

export function demoSnapshots(from: Date, to: Date): Snapshot[] {
  const out: Snapshot[] = [];
  for (let t = Math.ceil(from.getTime() / STEP) * STEP; t < to.getTime(); t += STEP) {
    const r = rng(t / STEP);
    const d = new Date(t);
    const a = activity(d);
    const ai = Math.round(a * 60 + r() * 10);
    const chat = Math.round(ai * 0.52);
    const debates = Math.round(ai * 0.21);
    const minuteOfDay = Math.floor(t / 60000) % 1440;
    const apiOk = r() > 0.004;
    const probeOf = (base: number): GroqModelProbe => {
      const ok = r() > 0.01;
      return {
        ok, latencyMs: Math.round(base + r() * base * 0.6),
        remainingRequests: Math.round(1000 * (1 - (minuteOfDay / 1440) * 0.7)), limitRequests: 1000,
        remainingTokens: 7000, limitTokens: 8000, probedAt: d.toISOString(), ...(ok ? {} : { error: "HTTP 503" }),
      };
    };
    const day = t / 86400_000;
    out.push({
      id: t / STEP,
      taken_at: d.toISOString(),
      online: Math.round(a * 26 + r() * 4),
      ai_requests_5m: ai,
      by_feature: { chat, debates, challenges: ai - chat - debates, documents: r() > 0.8 ? 1 : 0 },
      groq: {
        api: apiOk ? { ok: true, latencyMs: Math.round(60 + r() * 80) } : { ok: false, latencyMs: null, error: "HTTP 503" },
        models: {
          [MODELS.primary]: minuteOfDay % 30 === 0 ? probeOf(420) : null,
          [MODELS.fallback]: minuteOfDay % 60 === 0 ? probeOf(180) : null,
        },
      },
      supabase: {
        apiRequests24h: Math.round(40000 + r() * 10000),
        dbBytes: Math.round((200 + (day % 100) * 0.3) * MB), dbLimitBytes: 500 * MB,
        storageBytes: Math.round((700 + (day % 100) * 0.8) * MB), storageLimitBytes: 1024 * MB,
      },
      errors: apiOk ? null : { groq_api: "HTTP 503" },
    });
  }
  return out;
}

const FIRST = ["lea", "tom", "ines", "hugo", "chloe", "yanis", "manon", "lucas", "sarah", "nathan", "jade", "adam"];
const LAST = ["martin", "bernard", "dubois", "robert", "richard"];
const FEATS: FeatureKey[] = ["chat", "debates", "challenges", "documents"];
const DEMO_NOW = Date.parse("2026-09-30T12:00:00Z");

function makeUsers(): UserRow[] {
  const r = rng(42);
  return Array.from({ length: 60 }, (_, i) => {
    const created = DEMO_NOW - Math.floor(r() * 90) * 86400_000 - Math.floor(r() * 86400_000);
    const last = r() > 0.2 ? DEMO_NOW - Math.floor(r() * 10 * 86400_000) : null;
    return {
      id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
      email: `${FIRST[i % FIRST.length]}.${LAST[i % LAST.length]}${i}@exemple.fr`,
      createdAt: new Date(created).toISOString(),
      lastSignInAt: last ? new Date(last).toISOString() : null,
      lastActivity: last ? new Date(last + 600_000).toISOString() : null,
      aiRequests: last ? Math.floor(r() * 400) : 0,
      features: last ? FEATS.filter(() => r() > 0.4) : [],
    };
  }).sort((a, b) => (b.lastActivity ?? "").localeCompare(a.lastActivity ?? ""));
}

function bucketize(snaps: Snapshot[], bucket: "hour" | "day"): SeriesPoint[] {
  const size = bucket === "hour" ? 3600_000 : 86400_000;
  const map = new Map<number, number>();
  for (const s of snaps) {
    const k = Math.floor(Date.parse(s.taken_at) / size) * size;
    map.set(k, (map.get(k) ?? 0) + (s.ai_requests_5m ?? 0));
  }
  return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([t, n]) => ({ t: new Date(t).toISOString(), n }));
}

const DEFAULT_RULES: AlertRule[] = [
  { key: "activity_drop", enabled: true, threshold: 0, params: { startHour: 8, endHour: 23, minLastWeek: 5 } },
  { key: "collector_stale", enabled: true, threshold: 15, params: {} },
  { key: "groq_down", enabled: true, threshold: 1, params: {} },
  { key: "groq_quota", enabled: true, threshold: 0.8, params: {} },
  { key: "groq_slow", enabled: true, threshold: 5000, params: {} },
  { key: "supabase_db", enabled: true, threshold: 0.8, params: {} },
  { key: "supabase_storage", enabled: true, threshold: 0.8, params: {} },
];

export const demo = {
  lastSnapshotAt(now: Date): string {
    return new Date(Math.floor(now.getTime() / STEP) * STEP).toISOString();
  },

  overview(period: Period, now: Date): OverviewData {
    const r = periodRange(period, now);
    const all = demoSnapshots(r.prevFrom, now);
    const cur = all.filter((s) => Date.parse(s.taken_at) >= r.from.getTime());
    const sum = (xs: Snapshot[]) => xs.reduce((a, s) => a + (s.ai_requests_5m ?? 0), 0);
    const users = makeUsers();
    const f = cur.reduce(
      (acc, s) => {
        for (const k of FEATS) acc[k] += s.by_feature?.[k] ?? 0;
        return acc;
      },
      { chat: 0, debates: 0, challenges: 0, documents: 0 } as Record<FeatureKey, number>,
    );
    const byFeature: FeatureCount[] = [
      { feature: "chat", mode: "coach", n: Math.round(f.chat * 0.7) },
      { feature: "chat", mode: "debate", n: Math.round(f.chat * 0.3) },
      { feature: "debates", mode: null, n: f.debates },
      { feature: "challenges", mode: null, n: f.challenges },
      { feature: "documents", mode: null, n: f.documents },
    ];
    const last24 = all.filter((s) => Date.parse(s.taken_at) >= now.getTime() - 24 * 3600_000);
    return {
      period, label: r.label, hours: r.hours, bucket: r.bucket,
      snaps: { ok: true, data: deriveOverviewSnaps(last24, now) },
      kpis: {
        ok: true,
        data: {
          aiCount: sum(cur), aiPrev: sum(all) - sum(cur), usersTotal: users.length,
          usersNew: users.filter((u) => Date.parse(u.createdAt) >= r.from.getTime()).length,
          activePeriod: users.filter((u) => u.lastActivity && Date.parse(u.lastActivity) >= r.from.getTime()).length,
          active7d: users.filter((u) => u.lastActivity && Date.parse(u.lastActivity) >= now.getTime() - 7 * 86400_000).length,
          docErrors: 2,
        },
      },
      series: { ok: true, data: bucketize(cur, r.bucket) },
      byFeature: { ok: true, data: byFeature },
      signups: {
        ok: true,
        data: [...users].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5)
          .map((u) => ({ id: u.id, email: u.email, createdAt: u.createdAt })),
      },
    };
  },

  users(): UserRow[] {
    return makeUsers();
  },

  userDetail(id: string): UserDetail | null {
    const user = makeUsers().find((u) => u.id === id);
    if (!user) return null;
    const r = rng(id.length + Number(id.slice(-4)));
    const daily = Array.from({ length: 31 }, (_, i) => {
      const actions = Math.floor(r() * 15);
      return { day: new Date(DEMO_NOW - (30 - i) * 86400_000).toISOString(), actions, ai: actions + Math.floor(r() * 3) };
    });
    return {
      user,
      documents: Math.floor(r() * 6),
      daily,
      features: user.features.filter((f) => f !== "documents").map((feature) => ({ feature, n: Math.floor(r() * 120) + 1 })),
      skills: ["argumentation", "esprit critique", "logique", "synthèse"].map((skill) => ({
        skill, avg: 40 + Math.floor(r() * 55), n: 1 + Math.floor(r() * 12),
      })),
    };
  },

  apis(period: Period, now: Date): ApisData {
    const r = periodRange(period, now);
    return { label: r.label, derived: { ok: true, data: deriveApis(demoSnapshots(r.from, now)) }, docErrors: { ok: true, data: 2 } };
  },

  alertsPage(): AlertsPageData {
    const alerts: Alert[] = [
      { id: 4, rule_key: "supabase_storage", opened_at: "2026-09-30T09:12:00Z", resolved_at: null, message: "⚠️ Stockage Noesis à 82 % (840 Mo / 1 Go)" },
      { id: 3, rule_key: "groq_slow", opened_at: "2026-09-29T20:30:00Z", resolved_at: "2026-09-29T21:00:00Z", message: "🐢 Groq gpt-oss-120b lent : 6,2 s (seuil 5 s)" },
      { id: 2, rule_key: "groq_down", opened_at: "2026-09-28T14:05:00Z", resolved_at: "2026-09-28T14:15:00Z", message: "🔴 API Groq injoignable depuis 2 relevés (HTTP 503)" },
      { id: 1, rule_key: "activity_drop", opened_at: "2026-09-27T10:00:00Z", resolved_at: "2026-09-27T11:30:00Z", message: "📉 0 demande IA en 2 h (14 la semaine dernière à la même heure)" },
    ];
    return { rules: { ok: true, data: DEFAULT_RULES }, alerts: { ok: true, data: alerts } };
  },
};
