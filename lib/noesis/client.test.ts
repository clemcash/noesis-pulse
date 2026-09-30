import { describe, expect, it, vi } from "vitest";
import { runNoesisSql } from "./client";

function fakeFetch(status: number, body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
}

describe("runNoesisSql", () => {
  it("envoie la requête en lecture seule et renvoie les lignes", async () => {
    const f = fakeFetch(201, [{ n: 3 }]);
    const rows = await runNoesisSql<{ n: number }>("select 3 as n", { fetchImpl: f, ref: "abc", token: "t" });
    expect(rows).toEqual([{ n: 3 }]);
    const [url, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("https://api.supabase.com/v1/projects/abc/database/query");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer t");
    expect(JSON.parse(init.body)).toEqual({ query: "select 3 as n", read_only: true });
  });

  it("refuse une requête d'écriture sans appeler l'API", async () => {
    const f = fakeFetch(201, []);
    await expect(runNoesisSql("delete from x", { fetchImpl: f, ref: "a", token: "t" })).rejects.toThrow(/Requête refusée/);
    expect(f).not.toHaveBeenCalled();
  });

  it("remonte une erreur HTTP lisible sans le jeton", async () => {
    const f = fakeFetch(401, { message: "Unauthorized" });
    await expect(runNoesisSql("select 1", { fetchImpl: f, ref: "a", token: "secret-token" })).rejects.toThrow(
      /Management API 401/,
    );
    await expect(runNoesisSql("select 1", { fetchImpl: f, ref: "a", token: "secret-token" })).rejects.not.toThrow(
      /secret-token/,
    );
  });
});
