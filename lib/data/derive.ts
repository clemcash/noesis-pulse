import { latestProbes } from "@/lib/sources/groq";
import { availability, peak } from "@/lib/stats";
import { parisDayBounds } from "@/lib/time";
import { MODELS } from "@/lib/types";
import type { Snapshot } from "@/lib/types";
import type { ApisDerived, LatencyRow, OverviewSnaps } from "./types";

const MODEL_LIST = [MODELS.primary, MODELS.fallback];

export function downsample<T>(xs: T[], max: number): T[] {
  if (xs.length <= max) return xs;
  const step = xs.length / max;
  const out: T[] = [];
  for (let i = 0; i < max; i++) out.push(xs[Math.floor(i * step)]);
  out[out.length - 1] = xs[xs.length - 1];
  return out;
}

export function deriveOverviewSnaps(snaps: Snapshot[], now: Date): OverviewSnaps {
  const today = parisDayBounds(now, 0).from.getTime();
  return {
    last: snaps.at(-1) ?? null,
    online: snaps.map((s) => ({ t: Date.parse(s.taken_at), n: s.online })),
    peakToday: peak(snaps.filter((s) => Date.parse(s.taken_at) >= today)),
    probes: latestProbes(snaps, MODEL_LIST),
  };
}

export function deriveApis(snaps: Snapshot[], maxPoints = 300): ApisDerived {
  const probeRows: LatencyRow[] = [];
  for (const s of snaps) {
    const p = s.groq?.models?.[MODELS.primary];
    const f = s.groq?.models?.[MODELS.fallback];
    if (p || f) {
      probeRows.push({
        t: Date.parse(s.taken_at), api: null,
        primary: p?.ok ? p.latencyMs : null,
        fallback: f?.ok ? f.latencyMs : null,
      });
    }
  }
  const apiRows: LatencyRow[] = snaps.map((s) => ({
    t: Date.parse(s.taken_at),
    api: s.groq?.api.ok ? s.groq.api.latencyMs : null,
    primary: null,
    fallback: null,
  }));
  // Fusion : une ligne par instant ; les sondes (rares) ne sont jamais écartées par le sous-échantillonnage.
  const byT = new Map<number, LatencyRow>();
  for (const r of downsample(apiRows, maxPoints)) byT.set(r.t, { ...r });
  for (const r of downsample(probeRows, maxPoints)) {
    const cur = byT.get(r.t);
    byT.set(r.t, cur ? { ...cur, primary: r.primary, fallback: r.fallback } : r);
  }

  const withErrors = snaps.filter((s) => s.errors && Object.keys(s.errors).length);
  return {
    latency: [...byT.values()].sort((a, b) => a.t - b.t),
    storage: downsample(snaps, maxPoints).map((s) => ({
      t: Date.parse(s.taken_at), db: s.supabase?.dbBytes ?? null, storage: s.supabase?.storageBytes ?? null,
    })),
    availability: {
      api: availability(snaps.map((s) => s.groq?.api.ok)),
      primary: availability(snaps.map((s) => s.groq?.models?.[MODELS.primary]?.ok)),
      fallback: availability(snaps.map((s) => s.groq?.models?.[MODELS.fallback]?.ok)),
    },
    latestSupabase: [...snaps].reverse().find((s) => s.supabase)?.supabase ?? null,
    probes: latestProbes(snaps, MODEL_LIST),
    collectErrors: withErrors.slice(-10).reverse().map((s) => ({ at: s.taken_at, errors: s.errors! })),
  };
}
