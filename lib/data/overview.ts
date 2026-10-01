import "server-only";
import { demo } from "@/lib/demo";
import { isDemo } from "@/lib/env";
import { runNoesisSql } from "@/lib/noesis/client";
import {
  aiSeriesSql, byFeatureSql, kpiSql, latestSignupsSql, mapByFeature, mapKpis, mapSeries, mapSignups,
} from "@/lib/noesis/queries";
import { periodRange } from "@/lib/period";
import { settle } from "@/lib/result";
import * as store from "@/lib/store";
import type { Period } from "@/lib/types";
import { deriveOverviewSnaps } from "./derive";
import { memo } from "./memo";
import type { OverviewData } from "./types";

const TTL = 60_000;

export async function getOverview(period: Period): Promise<OverviewData> {
  const now = new Date();
  if (isDemo()) return demo.overview(period, now);
  const r = periodRange(period, now);
  const [snaps, kpis, series, byFeature, signups] = await Promise.all([
    settle(store.snapshotsSince(new Date(now.getTime() - 24 * 3600_000), now).then((s) => deriveOverviewSnaps(s, now))),
    settle(memo(`kpis:${period}`, TTL, async () => mapKpis(await runNoesisSql(kpiSql(r.from, r.prevFrom))))),
    settle(memo(`series:${period}`, TTL, async () => mapSeries(await runNoesisSql(aiSeriesSql(r.from, r.to, r.bucket))))),
    settle(memo(`features:${period}`, TTL, async () => mapByFeature(await runNoesisSql(byFeatureSql(r.from))))),
    settle(memo("signups", TTL, async () => mapSignups(await runNoesisSql(latestSignupsSql(5))))),
  ]);
  return { period, label: r.label, hours: r.hours, bucket: r.bucket, snaps, kpis, series, byFeature, signups };
}
