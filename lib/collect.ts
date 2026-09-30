import type { CollectRow } from "@/lib/noesis/queries";
import { errorMessage } from "@/lib/result";
import { latestProbes, shouldProbe } from "@/lib/sources/groq";
import { MODELS, PROBE_INTERVAL_MIN } from "@/lib/types";
import type { GroqApiCheck, GroqModelProbe, Snapshot } from "@/lib/types";

export type CollectDeps = {
  now: Date;
  noesis: () => Promise<CollectRow>;
  apiRequests24h: () => Promise<number>;
  groqApi: () => Promise<GroqApiCheck>;
  probe: (model: string) => Promise<GroqModelProbe>;
  recent: Snapshot[];
  limits: { dbLimitBytes: number; storageLimitBytes: number };
};

export type CollectOutput = {
  snapshot: Snapshot;
  noesis: CollectRow | null;
  probes: Record<string, GroqModelProbe | null>;
};

export async function buildSnapshot(d: CollectDeps): Promise<CollectOutput> {
  const models = [MODELS.primary, MODELS.fallback];
  const last = latestProbes(d.recent, models);
  const toProbe = models.filter((m) => shouldProbe(last[m], PROBE_INTERVAL_MIN[m], d.now));

  const [noesis, apiReq, api, ...probed] = await Promise.allSettled([
    d.noesis(),
    d.apiRequests24h(),
    d.groqApi(),
    ...toProbe.map((m) => d.probe(m)),
  ]);

  const errors: Record<string, string> = {};
  const n = noesis.status === "fulfilled" ? (noesis.value as CollectRow) : null;
  if (noesis.status === "rejected") errors.noesis = errorMessage(noesis.reason);
  if (apiReq.status === "rejected") errors.supabase_usage = errorMessage(apiReq.reason);

  const apiCheck: GroqApiCheck =
    api.status === "fulfilled" ? (api.value as GroqApiCheck) : { ok: false, latencyMs: null, error: errorMessage(api.reason) };
  if (!apiCheck.ok) errors.groq_api = apiCheck.error ?? "erreur";

  const newModels: Record<string, GroqModelProbe | null> = Object.fromEntries(models.map((m) => [m, null]));
  toProbe.forEach((m, i) => {
    const r = probed[i];
    const p: GroqModelProbe =
      r.status === "fulfilled"
        ? (r.value as GroqModelProbe)
        : {
            ok: false, latencyMs: null, remainingRequests: null, limitRequests: null, remainingTokens: null, limitTokens: null,
            error: errorMessage(r.reason), probedAt: d.now.toISOString(),
          };
    newModels[m] = p;
    if (!p.ok) errors[`groq:${m}`] = p.error ?? "erreur";
  });

  const snapshot: Snapshot = {
    taken_at: d.now.toISOString(),
    online: n ? n.online : null,
    ai_requests_5m: n ? n.ai5m : null,
    by_feature: n ? n.byFeature5m : null,
    groq: { api: apiCheck, models: newModels },
    supabase: n
      ? {
          apiRequests24h: apiReq.status === "fulfilled" ? (apiReq.value as number) : null,
          dbBytes: n.dbBytes,
          dbLimitBytes: d.limits.dbLimitBytes,
          storageBytes: n.storageBytes,
          storageLimitBytes: d.limits.storageLimitBytes,
        }
      : null,
    errors: Object.keys(errors).length ? errors : null,
  };

  const probes = Object.fromEntries(models.map((m) => [m, newModels[m] ?? last[m]]));
  return { snapshot, noesis: n, probes };
}
