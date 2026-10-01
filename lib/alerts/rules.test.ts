import { describe, expect, it } from "vitest";
import type { Alert, AlertRule, GroqModelProbe, RuleKey, Snapshot } from "@/lib/types";
import { MODELS } from "@/lib/types";
import { checkRule, diffAlerts, type RuleContext } from "./rules";

const rule = (key: RuleKey, threshold: number, params: Record<string, number> = {}, enabled = true): AlertRule => ({
  key, threshold, params, enabled,
});
const snap = (over: Partial<Snapshot> = {}): Snapshot => ({
  taken_at: "2026-09-30T12:00:00Z", online: 3, ai_requests_5m: 2, by_feature: null, errors: null,
  groq: { api: { ok: true, latencyMs: 80 }, models: {} },
  supabase: { apiRequests24h: 1, dbBytes: 100, dbLimitBytes: 1000, storageBytes: 100, storageLimitBytes: 1000 },
  ...over,
});
const probe = (over: Partial<GroqModelProbe> = {}): GroqModelProbe => ({
  ok: true, latencyMs: 400, remainingRequests: 600, limitRequests: 1000, remainingTokens: null, limitTokens: null,
  probedAt: "2026-09-30T11:50:00Z", ...over,
});
// 12:00 UTC = 14:00 à Paris (dans la fenêtre 8h-23h)
const ctx = (over: Partial<RuleContext> = {}): RuleContext => ({
  now: new Date("2026-09-30T12:00:00Z"),
  latest: snap(), previous: snap(),
  probes: { [MODELS.primary]: probe(), [MODELS.fallback]: probe() },
  ai2h: 50, ai2hLastWeek: 40, lastSnapshotAt: "2026-09-30T12:00:00Z",
  ...over,
});
const down = { ok: false, latencyMs: null, error: "ECONNRESET" };

describe("groq_down", () => {
  const r = rule("groq_down", 1);
  it("calme quand tout va bien", () => expect(checkRule(r, ctx()).firing).toBe(false));
  it("1 seul relevé API KO ne suffit pas", () => {
    expect(checkRule(r, ctx({ latest: snap({ groq: { api: down, models: {} } }) })).firing).toBe(false);
  });
  it("2 relevés API KO consécutifs", () => {
    const res = checkRule(r, ctx({ latest: snap({ groq: { api: down, models: {} } }), previous: snap({ groq: { api: down, models: {} } }) }));
    expect(res).toEqual({ firing: true, message: "🔴 API Groq injoignable depuis 2 relevés (ECONNRESET)" });
  });
  it("dernière sonde 120b en échec", () => {
    const res = checkRule(r, ctx({ probes: { [MODELS.primary]: probe({ ok: false, error: "HTTP 503" }) } }));
    expect(res).toEqual({ firing: true, message: "🔴 Groq gpt-oss-120b en échec : HTTP 503" });
  });
});

describe("groq_slow / groq_quota", () => {
  it("lent au-delà du seuil", () => {
    const res = checkRule(rule("groq_slow", 5000), ctx({ probes: { [MODELS.primary]: probe({ latencyMs: 6200 }) } }));
    expect(res).toEqual({ firing: true, message: "🐢 Groq gpt-oss-120b lent : 6,2 s (seuil 5 s)" });
  });
  it("sonde en échec ne compte pas comme lente", () => {
    expect(checkRule(rule("groq_slow", 5000), ctx({ probes: { [MODELS.primary]: probe({ ok: false, latencyMs: 9000 }) } })).firing).toBe(false);
  });
  it("quota > 80 %", () => {
    const res = checkRule(rule("groq_quota", 0.8), ctx({ probes: { [MODELS.primary]: probe({ remainingRequests: 150 }) } }));
    expect(res).toEqual({ firing: true, message: "⚠️ Quota Groq du jour consommé à 85 % (150 requêtes restantes)" });
  });
  it("quota inconnu → inconnu", () => {
    expect(checkRule(rule("groq_quota", 0.8), ctx({ probes: {} })).firing).toBeNull();
  });
});

describe("supabase", () => {
  it("base > 80 %", () => {
    const s = snap({ supabase: { apiRequests24h: 1, dbBytes: 420 * 2 ** 20, dbLimitBytes: 500 * 2 ** 20, storageBytes: 0, storageLimitBytes: 1 } });
    const res = checkRule(rule("supabase_db", 0.8), ctx({ latest: s }));
    expect(res).toEqual({ firing: true, message: "⚠️ Base Noesis à 84 % (420 Mo / 500 Mo)" });
  });
  it("stockage sous le seuil", () => {
    expect(checkRule(rule("supabase_storage", 0.8), ctx()).firing).toBe(false);
  });
  it("supabase null → inconnu", () => {
    expect(checkRule(rule("supabase_db", 0.8), ctx({ latest: snap({ supabase: null }) })).firing).toBeNull();
  });
});

describe("activity_drop", () => {
  const r = rule("activity_drop", 0, { startHour: 8, endHour: 23, minLastWeek: 5 });
  it("0 demande alors que J-7 en avait", () => {
    expect(checkRule(r, ctx({ ai2h: 0, ai2hLastWeek: 12 }))).toEqual({
      firing: true, message: "📉 0 demande IA en 2 h (12 la semaine dernière à la même heure)",
    });
  });
  it("J-7 trop calme → pas d'alerte", () => {
    expect(checkRule(r, ctx({ ai2h: 0, ai2hLastWeek: 2 })).firing).toBe(false);
  });
  it("la nuit → pas d'alerte (03:00 Paris)", () => {
    expect(checkRule(r, ctx({ now: new Date("2026-09-30T01:00:00Z"), ai2h: 0, ai2hLastWeek: 12 })).firing).toBe(false);
  });
});

describe("collector_stale", () => {
  const r = rule("collector_stale", 15);
  it("relevé récent", () => expect(checkRule(r, ctx({ lastSnapshotAt: "2026-09-30T11:55:00Z" })).firing).toBe(false));
  it("relevé trop vieux", () => {
    expect(checkRule(r, ctx({ lastSnapshotAt: "2026-09-30T11:37:00Z" }))).toEqual({ firing: true, message: "⏱️ Aucun relevé depuis 23 min" });
  });
  it("aucun relevé", () => {
    expect(checkRule(r, ctx({ lastSnapshotAt: null }))).toEqual({ firing: true, message: "⏱️ Aucun relevé enregistré" });
  });
});

describe("diffAlerts", () => {
  const openAlert: Alert = { id: 9, rule_key: "groq_slow", opened_at: "x", resolved_at: null, message: "m" };
  const slowCtx = ctx({ probes: { [MODELS.primary]: probe({ latencyMs: 6200 }) } });

  it("ouvre une alerte qui se déclenche", () => {
    const d = diffAlerts([rule("groq_slow", 5000)], slowCtx, []);
    expect(d.toOpen).toEqual([{ rule_key: "groq_slow", message: "🐢 Groq gpt-oss-120b lent : 6,2 s (seuil 5 s)" }]);
    expect(d.toResolve).toEqual([]);
  });
  it("ne ré-ouvre pas une alerte déjà ouverte (anti-spam)", () => {
    const d = diffAlerts([rule("groq_slow", 5000)], slowCtx, [openAlert]);
    expect(d).toEqual({ toOpen: [], toResolve: [] });
  });
  it("résout une alerte revenue à la normale", () => {
    const d = diffAlerts([rule("groq_slow", 5000)], ctx(), [openAlert]);
    expect(d.toResolve).toEqual([{ alert: openAlert, message: "✅ Résolu : Groq lent" }]);
  });
  it("ne résout ni n'ouvre quand la donnée est manquante", () => {
    const a: Alert = { ...openAlert, rule_key: "supabase_db" };
    const d = diffAlerts([rule("supabase_db", 0.8)], ctx({ latest: snap({ supabase: null }) }), [a]);
    expect(d).toEqual({ toOpen: [], toResolve: [] });
  });
  it("règle désactivée : n'ouvre jamais", () => {
    const d = diffAlerts([rule("groq_slow", 5000, {}, false)], slowCtx, []);
    expect(d).toEqual({ toOpen: [], toResolve: [] });
  });
  it("règle désactivée avec alerte ouverte → résolue", () => {
    const d = diffAlerts([rule("groq_slow", 5000, {}, false)], slowCtx, [openAlert]);
    expect(d.toResolve).toEqual([{ alert: openAlert, message: "ℹ️ Règle désactivée : Groq lent" }]);
    expect(d.toOpen).toEqual([]);
  });
  it("probe absente : groq_slow inconnu, groq_down inconnu sans API ni sonde", () => {
    expect(checkRule(rule("groq_slow", 5000), ctx({ probes: {} })).firing).toBeNull();
    expect(checkRule(rule("groq_down", 1), ctx({ probes: {}, latest: snap({ groq: null }) })).firing).toBeNull();
  });
  it("activity_drop : donnée manquante inconnue, hors fenêtre faux", () => {
    expect(checkRule(rule("activity_drop", 0), ctx({ ai2h: null })).firing).toBeNull();
    expect(checkRule(rule("activity_drop", 0), ctx({ now: new Date("2026-09-30T01:00:00Z"), ai2h: null })).firing).toBe(false);
  });
});
