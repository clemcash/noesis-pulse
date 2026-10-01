import { describe, expect, it } from "vitest";
import type { GroqModelProbe, Snapshot } from "@/lib/types";
import { MODELS } from "@/lib/types";
import { deriveApis, deriveOverviewSnaps, downsample } from "./derive";

const probe = (ok: boolean, latencyMs: number, at: string): GroqModelProbe => ({
  ok, latencyMs, remainingRequests: 500, limitRequests: 1000, remainingTokens: null, limitTokens: null, probedAt: at,
});
const snap = (at: string, over: Partial<Snapshot> = {}): Snapshot => ({
  taken_at: at, online: 5, ai_requests_5m: 1, by_feature: null, errors: null,
  groq: { api: { ok: true, latencyMs: 100 }, models: { [MODELS.primary]: null, [MODELS.fallback]: null } },
  supabase: { apiRequests24h: 10, dbBytes: 1, dbLimitBytes: 10, storageBytes: 2, storageLimitBytes: 20 },
  ...over,
});

describe("downsample", () => {
  it("garde tout sous la limite", () => expect(downsample([1, 2, 3], 5)).toEqual([1, 2, 3]));
  it("réduit en gardant le premier et le dernier", () => {
    const out = downsample(Array.from({ length: 1000 }, (_, i) => i), 100);
    expect(out.length).toBe(100);
    expect(out[0]).toBe(0);
    expect(out[99]).toBe(999);
  });
});

describe("deriveOverviewSnaps", () => {
  it("dernier relevé, courbe, pic du jour (Paris) et sondes", () => {
    const now = new Date("2026-09-30T12:00:00Z"); // 14h Paris ; minuit Paris = 29/09 22:00Z
    const snaps = [
      snap("2026-09-29T21:00:00Z", { online: 40 }), // hier soir à Paris → exclu du pic du jour
      snap("2026-09-30T08:00:00Z", { online: 12, groq: { api: { ok: true, latencyMs: 1 }, models: { [MODELS.primary]: probe(true, 400, "2026-09-30T08:00:00Z") } } }),
      snap("2026-09-30T11:55:00Z", { online: 7 }),
    ];
    const d = deriveOverviewSnaps(snaps, now);
    expect(d.last?.online).toBe(7);
    expect(d.online).toEqual([
      { t: Date.parse("2026-09-29T21:00:00Z"), n: 40 },
      { t: Date.parse("2026-09-30T08:00:00Z"), n: 12 },
      { t: Date.parse("2026-09-30T11:55:00Z"), n: 7 },
    ]);
    expect(d.peakToday).toEqual({ value: 12, at: "2026-09-30T08:00:00Z" });
    expect(d.probes[MODELS.primary]?.latencyMs).toBe(400);
  });
});

describe("deriveApis", () => {
  it("disponibilités, latences fusionnées, stockage, erreurs", () => {
    const snaps = [
      snap("2026-09-30T10:00:00Z", {
        groq: { api: { ok: true, latencyMs: 100 }, models: { [MODELS.primary]: probe(true, 400, "2026-09-30T10:00:00Z"), [MODELS.fallback]: null } },
      }),
      snap("2026-09-30T10:05:00Z", {
        groq: { api: { ok: false, latencyMs: null, error: "x" }, models: { [MODELS.primary]: null, [MODELS.fallback]: probe(false, 0, "2026-09-30T10:05:00Z") } },
        errors: { groq_api: "x" },
      }),
    ];
    const d = deriveApis(snaps);
    expect(d.availability).toEqual({ api: 0.5, primary: 1, fallback: 0 });
    expect(d.latency).toEqual([
      { t: Date.parse("2026-09-30T10:00:00Z"), api: 100, primary: 400, fallback: null },
      { t: Date.parse("2026-09-30T10:05:00Z"), api: null, primary: null, fallback: null },
    ]);
    expect(d.storage[1]).toEqual({ t: Date.parse("2026-09-30T10:05:00Z"), db: 1, storage: 2 });
    expect(d.latestSupabase?.dbLimitBytes).toBe(10);
    expect(d.collectErrors).toEqual([{ at: "2026-09-30T10:05:00Z", errors: { groq_api: "x" } }]);
  });
});
