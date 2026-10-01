import type { FeatureCount, Kpis, SeriesPoint, Signup } from "@/lib/noesis/queries";
import type { Result } from "@/lib/result";
import type { Alert, AlertRule, GroqModelProbe, Period, Snapshot, SupabaseUsage } from "@/lib/types";

export type Pt = { t: number; n: number | null }; // t = epoch ms (sérialisable vers les composants client)
export type OverviewSnaps = { last: Snapshot | null; online: Pt[]; peakToday: { value: number; at: string } | null; probes: Record<string, GroqModelProbe | null> };
export type OverviewData = {
  period: Period; label: string; hours: number; bucket: "hour" | "day";
  snaps: Result<OverviewSnaps>; kpis: Result<Kpis>; series: Result<SeriesPoint[]>;
  byFeature: Result<FeatureCount[]>; signups: Result<Signup[]>;
};
export type LatencyRow = { t: number; api: number | null; primary: number | null; fallback: number | null };
export type StorageRow = { t: number; db: number | null; storage: number | null };
export type ApisDerived = {
  latency: LatencyRow[]; storage: StorageRow[];
  availability: { api: number | null; primary: number | null; fallback: number | null };
  latestSupabase: SupabaseUsage | null; probes: Record<string, GroqModelProbe | null>;
  collectErrors: { at: string; errors: Record<string, string> }[];
};
export type ApisData = { label: string; derived: Result<ApisDerived>; docErrors: Result<number> };
export type AlertsPageData = { rules: Result<AlertRule[]>; alerts: Result<Alert[]> };
