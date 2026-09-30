import { describe, expect, it, vi } from "vitest";
import type { GroqModelProbe, Snapshot } from "@/lib/types";
import { checkGroqApi, latestProbes, probeGroqModel, shouldProbe } from "./groq";

const clock = () => {
  let t = 1000;
  return () => (t += 250);
};

describe("checkGroqApi", () => {
  it("ok + latence", async () => {
    const f = vi.fn(async () => new Response("{}", { status: 200 }));
    const r = await checkGroqApi({ fetchImpl: f as unknown as typeof fetch, key: "k", now: clock() });
    expect(r).toEqual({ ok: true, latencyMs: 250 });
    expect((f.mock.calls[0] as unknown[])[0]).toBe("https://api.groq.com/openai/v1/models");
  });
  it("ne rejette pas en cas d'erreur réseau", async () => {
    const f = vi.fn(async () => {
      throw new Error("ECONNRESET");
    });
    const r = await checkGroqApi({ fetchImpl: f as unknown as typeof fetch, key: "k", now: clock() });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/ECONNRESET/);
  });
});

describe("probeGroqModel", () => {
  it("lit les en-têtes de quota", async () => {
    const f = vi.fn(
      async () =>
        new Response("{}", {
          status: 200,
          headers: {
            "x-ratelimit-limit-requests": "1000",
            "x-ratelimit-remaining-requests": "360",
            "x-ratelimit-limit-tokens": "8000",
            "x-ratelimit-remaining-tokens": "7990",
          },
        }),
    );
    const at = new Date("2026-09-30T12:00:00Z");
    const r = await probeGroqModel("openai/gpt-oss-120b", { fetchImpl: f as unknown as typeof fetch, key: "k", now: clock(), at });
    expect(r).toEqual({
      ok: true, latencyMs: 250, remainingRequests: 360, limitRequests: 1000, remainingTokens: 7990, limitTokens: 8000,
      probedAt: "2026-09-30T12:00:00.000Z",
    });
    const body = JSON.parse(((f.mock.calls[0] as unknown[])[1] as RequestInit).body as string);
    expect(body.model).toBe("openai/gpt-oss-120b");
    expect(body.max_completion_tokens).toBe(16);
  });
  it("429 → ok=false avec message", async () => {
    const f = vi.fn(async () => new Response('{"error":{"message":"Rate limit"}}', { status: 429 }));
    const r = await probeGroqModel("m", { fetchImpl: f as unknown as typeof fetch, key: "k", now: clock() });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("HTTP 429 : Rate limit");
  });
});

const probe = (ok: boolean, at: string): GroqModelProbe => ({
  ok, latencyMs: 100, remainingRequests: null, limitRequests: null, remainingTokens: null, limitTokens: null, probedAt: at,
});
const snap = (at: string, models: Record<string, GroqModelProbe | null>): Snapshot => ({
  taken_at: at, online: 0, ai_requests_5m: 0, by_feature: null, supabase: null, errors: null,
  groq: { api: { ok: true, latencyMs: 1 }, models },
});

describe("planification des sondes", () => {
  it("latestProbes prend la plus récente non nulle par modèle", () => {
    const snaps = [
      snap("2026-09-30T12:00:00Z", { a: null, b: probe(true, "2026-09-30T12:00:00Z") }),
      snap("2026-09-30T11:30:00Z", { a: probe(false, "2026-09-30T11:30:00Z"), b: null }),
      snap("2026-09-30T11:00:00Z", { a: probe(true, "2026-09-30T11:00:00Z") }),
    ];
    const r = latestProbes(snaps, ["a", "b", "c"]);
    expect(r.a?.probedAt).toBe("2026-09-30T11:30:00Z");
    expect(r.b?.probedAt).toBe("2026-09-30T12:00:00Z");
    expect(r.c).toBeNull();
  });
  it("shouldProbe", () => {
    const now = new Date("2026-09-30T12:00:00Z");
    expect(shouldProbe(null, 30, now)).toBe(true);
    expect(shouldProbe(probe(true, "2026-09-30T11:40:00Z"), 30, now)).toBe(false);
    expect(shouldProbe(probe(true, "2026-09-30T11:31:00Z"), 30, now)).toBe(true); // marge d'1 min pour la gigue du cron
    expect(shouldProbe(probe(false, "2026-09-30T11:55:00Z"), 30, now)).toBe(true); // échec → re-sonde
  });
});
