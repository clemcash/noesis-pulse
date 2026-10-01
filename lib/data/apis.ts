import "server-only";
import { demo } from "@/lib/demo";
import { isDemo } from "@/lib/env";
import { runNoesisSql } from "@/lib/noesis/client";
import { kpiSql, mapKpis } from "@/lib/noesis/queries";
import { periodRange } from "@/lib/period";
import { settle } from "@/lib/result";
import * as store from "@/lib/store";
import type { Period } from "@/lib/types";
import { deriveApis } from "./derive";
import { memo } from "./memo";
import type { ApisData } from "./types";

export async function getApis(period: Period): Promise<ApisData> {
  const now = new Date();
  if (isDemo()) return demo.apis(period, now);
  const r = periodRange(period, now);
  const [derived, docErrors] = await Promise.all([
    settle(store.snapshotsSince(r.from, now).then((s) => deriveApis(s))),
    settle(memo(`kpis:${period}`, 60_000, async () => mapKpis(await runNoesisSql(kpiSql(r.from, r.prevFrom)))).then((k) => k.docErrors)),
  ]);
  return { label: r.label, derived, docErrors };
}
