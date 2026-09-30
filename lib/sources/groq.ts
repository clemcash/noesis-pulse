import { env } from "@/lib/env";
import { errorMessage } from "@/lib/result";
import type { GroqApiCheck, GroqModelProbe, Snapshot } from "@/lib/types";

const GROQ = "https://api.groq.com/openai/v1";
type Opts = { fetchImpl?: typeof fetch; key?: string; now?: () => number };

const header = (res: Response, name: string): number | null => {
  const v = res.headers.get(name);
  return v == null || v === "" || Number.isNaN(Number(v)) ? null : Number(v);
};

export async function checkGroqApi(opts: Opts = {}): Promise<GroqApiCheck> {
  const f = opts.fetchImpl ?? fetch;
  const now = opts.now ?? Date.now;
  const start = now();
  try {
    const res = await f(`${GROQ}/models`, {
      headers: { Authorization: `Bearer ${opts.key ?? env.groqKey}` },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    const latencyMs = now() - start;
    return res.ok ? { ok: true, latencyMs } : { ok: false, latencyMs, error: `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, latencyMs: null, error: errorMessage(e) };
  }
}

export async function probeGroqModel(model: string, opts: Opts & { at?: Date } = {}): Promise<GroqModelProbe> {
  const f = opts.fetchImpl ?? fetch;
  const now = opts.now ?? Date.now;
  const probedAt = (opts.at ?? new Date()).toISOString();
  const empty = { remainingRequests: null, limitRequests: null, remainingTokens: null, limitTokens: null };
  const start = now();
  try {
    const res = await f(`${GROQ}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${opts.key ?? env.groqKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages: [{ role: "user", content: "ping" }], max_completion_tokens: 16, reasoning_effort: "low" }),
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });
    const latencyMs = now() - start;
    const quota = {
      remainingRequests: header(res, "x-ratelimit-remaining-requests"),
      limitRequests: header(res, "x-ratelimit-limit-requests"),
      remainingTokens: header(res, "x-ratelimit-remaining-tokens"),
      limitTokens: header(res, "x-ratelimit-limit-tokens"),
    };
    if (res.ok) return { ok: true, latencyMs, ...quota, probedAt };
    let msg = "";
    try {
      msg = ((await res.json()) as { error?: { message?: string } }).error?.message ?? "";
    } catch {
      /* corps non JSON */
    }
    return { ok: false, latencyMs, ...quota, error: `HTTP ${res.status}${msg ? ` : ${msg}` : ""}`, probedAt };
  } catch (e) {
    return { ok: false, latencyMs: null, ...empty, error: errorMessage(e), probedAt };
  }
}

export function latestProbes(snaps: Snapshot[], models: string[]): Record<string, GroqModelProbe | null> {
  const out: Record<string, GroqModelProbe | null> = Object.fromEntries(models.map((m) => [m, null]));
  for (const s of snaps) {
    for (const m of models) {
      const p = s.groq?.models?.[m];
      if (p && (!out[m] || p.probedAt > out[m]!.probedAt)) out[m] = p;
    }
  }
  return out;
}

/** Re-sonde si jamais sondé, si l'intervalle est écoulé (marge 1 min) ou si la dernière sonde a échoué. */
export function shouldProbe(last: GroqModelProbe | null, intervalMin: number, now: Date): boolean {
  if (!last || !last.ok) return true;
  const ageMin = (now.getTime() - new Date(last.probedAt).getTime()) / 60000;
  return ageMin >= intervalMin - 1;
}
