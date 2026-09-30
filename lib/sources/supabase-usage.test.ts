import { describe, expect, it, vi } from "vitest";
import { fetchApiRequests24h, sumApiCounts } from "./supabase-usage";

describe("usage Supabase", () => {
  it("additionne tous les compteurs", () => {
    expect(
      sumApiCounts({
        result: [
          { timestamp: "x", total_auth_requests: 10, total_rest_requests: 100, total_storage_requests: 5, total_realtime_requests: 1 },
          { timestamp: "y", total_rest_requests: 4 },
        ],
      }),
    ).toBe(120);
  });
  it("appelle le bon endpoint", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ result: [{ total_rest_requests: 7 }] }), { status: 200 }));
    expect(await fetchApiRequests24h({ fetchImpl: f as unknown as typeof fetch, ref: "abc", token: "t" })).toBe(7);
    expect((f.mock.calls[0] as unknown[])[0]).toBe("https://api.supabase.com/v1/projects/abc/analytics/endpoints/usage.api-counts?interval=1day");
  });
  it("lève sur erreur HTTP", async () => {
    const f = vi.fn(async () => new Response("{}", { status: 500 }));
    await expect(fetchApiRequests24h({ fetchImpl: f as unknown as typeof fetch, ref: "a", token: "t" })).rejects.toThrow(/500/);
  });
});
