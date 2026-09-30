import { env } from "@/lib/env";
import { assertReadOnly } from "./sql";

export const MANAGEMENT_API = "https://api.supabase.com";

type Opts = { fetchImpl?: typeof fetch; ref?: string; token?: string; timeoutMs?: number };

/** Seul point d'accès à la base Noesis. SELECT uniquement. */
export async function runNoesisSql<T = Record<string, unknown>>(sql: string, opts: Opts = {}): Promise<T[]> {
  assertReadOnly(sql);
  const f = opts.fetchImpl ?? fetch;
  const ref = opts.ref ?? env.noesisRef;
  const token = opts.token ?? env.managementToken;
  const res = await f(`${MANAGEMENT_API}/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql, read_only: true }),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 10_000),
    cache: "no-store",
  });
  if (!res.ok) {
    let detail = "";
    try {
      const j = (await res.json()) as { message?: string };
      detail = j.message ? ` : ${j.message}` : "";
    } catch {
      /* corps non JSON */
    }
    throw new Error(`Management API ${res.status}${detail}`);
  }
  return (await res.json()) as T[];
}
