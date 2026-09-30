import { env } from "@/lib/env";
import { MANAGEMENT_API } from "@/lib/noesis/client";

type Counts = { result?: Record<string, unknown>[] };

export function sumApiCounts(body: Counts): number {
  let total = 0;
  for (const row of body.result ?? []) {
    for (const [k, v] of Object.entries(row)) {
      if (k.startsWith("total_") && typeof v === "number") total += v;
    }
  }
  return total;
}

export async function fetchApiRequests24h(
  opts: { fetchImpl?: typeof fetch; ref?: string; token?: string } = {},
): Promise<number> {
  const f = opts.fetchImpl ?? fetch;
  const ref = opts.ref ?? env.noesisRef;
  const token = opts.token ?? env.managementToken;
  const res = await f(`${MANAGEMENT_API}/v1/projects/${ref}/analytics/endpoints/usage.api-counts?interval=1day`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Usage API ${res.status}`);
  return sumApiCounts((await res.json()) as Counts);
}
