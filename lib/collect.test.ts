import { describe, expect, it, vi } from "vitest";
import type { GroqModelProbe, Snapshot } from "@/lib/types";
import { MODELS } from "@/lib/types";
import { buildSnapshot, type CollectDeps } from "./collect";

const NOW = new Date("2026-09-30T12:00:00Z");
const row = {
  online: 4, ai5m: 7, byFeature5m: { chat: 5, debates: 1, challenges: 1, documents: 0 },
  ai2h: 90, ai2hLastWeek: 80, dbBytes: 100, storageBytes: 200,
};
const probe = (ok: boolean, at: string): GroqModelProbe => ({
  ok, latencyMs: 400, remainingRequests: 500, limitRequests: 1000, remainingTokens: 1, limitTokens: 2, probedAt: at,
  ...(ok ? {} : { error: "HTTP 500" }),
});

function deps(over: Partial<CollectDeps> = {}): CollectDeps {
  return {
    now: NOW,
    noesis: async () => row,
    apiRequests24h: async () => 48000,
    groqApi: async () => ({ ok: true, latencyMs: 90 }),
    probe: vi.fn(async () => probe(true, NOW.toISOString())),
    recent: [],
    limits: { dbLimitBytes: 1000, storageLimitBytes: 2000 },
    ...over,
  };
}

describe("buildSnapshot", () => {
  it("assemble toutes les sources", async () => {
    const d = deps();
    const out = await buildSnapshot(d);
    expect(out.snapshot).toMatchObject({
      taken_at: NOW.toISOString(), online: 4, ai_requests_5m: 7,
      by_feature: row.byFeature5m,
      supabase: { apiRequests24h: 48000, dbBytes: 100, dbLimitBytes: 1000, storageBytes: 200, storageLimitBytes: 2000 },
      errors: null,
    });
    expect(out.snapshot.groq?.api).toEqual({ ok: true, latencyMs: 90 });
    expect(d.probe).toHaveBeenCalledTimes(2); // aucun historique → les 2 modèles
    expect(out.probes[MODELS.primary]?.ok).toBe(true);
  });

  it("ne re-sonde pas un modèle sondé récemment et réutilise la dernière sonde", async () => {
    const recent: Snapshot[] = [
      {
        taken_at: "2026-09-30T11:55:00Z", online: 1, ai_requests_5m: 0, by_feature: null, supabase: null, errors: null,
        groq: {
          api: { ok: true, latencyMs: 1 },
          models: { [MODELS.primary]: probe(true, "2026-09-30T11:45:00Z"), [MODELS.fallback]: probe(true, "2026-09-30T11:30:00Z") },
        },
      },
    ];
    const d = deps({ recent });
    const out = await buildSnapshot(d);
    expect(d.probe).not.toHaveBeenCalled();
    expect(out.snapshot.groq?.models).toEqual({ [MODELS.primary]: null, [MODELS.fallback]: null });
    expect(out.probes[MODELS.primary]?.probedAt).toBe("2026-09-30T11:45:00Z");
  });

  it("une source KO donne un relevé partiel avec erreur consignée", async () => {
    const out = await buildSnapshot(
      deps({
        noesis: async () => {
          throw new Error("Management API 401");
        },
        apiRequests24h: async () => {
          throw new Error("Usage API 500");
        },
        groqApi: async () => ({ ok: false, latencyMs: null, error: "ECONNRESET" }),
        probe: async () => probe(false, NOW.toISOString()),
      }),
    );
    expect(out.snapshot.online).toBeNull();
    expect(out.snapshot.ai_requests_5m).toBeNull();
    expect(out.snapshot.by_feature).toBeNull();
    expect(out.snapshot.supabase).toBeNull();
    expect(out.noesis).toBeNull();
    expect(out.snapshot.errors).toEqual({
      noesis: "Management API 401",
      supabase_usage: "Usage API 500",
      groq_api: "ECONNRESET",
      [`groq:${MODELS.primary}`]: "HTTP 500",
      [`groq:${MODELS.fallback}`]: "HTTP 500",
    });
  });

  it("usage API KO mais Noesis OK → tailles présentes, compteur null", async () => {
    const out = await buildSnapshot(
      deps({
        apiRequests24h: async () => {
          throw new Error("Usage API 500");
        },
      }),
    );
    expect(out.snapshot.supabase).toEqual({
      apiRequests24h: null, dbBytes: 100, dbLimitBytes: 1000, storageBytes: 200, storageLimitBytes: 2000,
    });
  });
});
