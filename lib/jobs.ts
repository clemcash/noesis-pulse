import "server-only";
import { runAlerts } from "@/lib/alerts/run";
import type { RuleContext } from "@/lib/alerts/rules";
import { sendTelegram } from "@/lib/alerts/telegram";
import { buildSnapshot } from "@/lib/collect";
import { buildDigest } from "@/lib/digest";
import { limits } from "@/lib/env";
import { runNoesisSql } from "@/lib/noesis/client";
import { collectSql, daySummarySql, mapCollect, mapDaySummary } from "@/lib/noesis/queries";
import { settle } from "@/lib/result";
import { checkGroqApi, probeGroqModel } from "@/lib/sources/groq";
import { fetchApiRequests24h } from "@/lib/sources/supabase-usage";
import { availability, peak } from "@/lib/stats";
import * as store from "@/lib/store";
import { parisDayBounds, parisHour } from "@/lib/time";

const RETENTION_DAYS = 90;

export async function runCollectJob(now: Date = new Date()) {
  const recent = await store.recentSnapshots(20);
  const out = await buildSnapshot({
    now,
    noesis: async () => mapCollect(await runNoesisSql(collectSql())),
    apiRequests24h: () => fetchApiRequests24h(),
    groqApi: () => checkGroqApi(),
    probe: (m) => probeGroqModel(m, { at: now }),
    recent,
    limits: limits(),
  });
  const saved = await store.insertSnapshot(out.snapshot);
  const ctx: RuleContext = {
    now,
    latest: saved,
    previous: recent[0] ?? null,
    probes: out.probes,
    ai2h: out.noesis?.ai2h ?? null,
    ai2hLastWeek: out.noesis?.ai2hLastWeek ?? null,
    lastSnapshotAt: saved.taken_at,
  };
  const alerts = await runAlerts({ rules: await store.getRules(), ctx, store, notify: (t) => sendTelegram(t) });
  await store.purgeSnapshots(new Date(now.getTime() - RETENTION_DAYS * 86400_000));
  return { ok: true as const, errors: out.snapshot.errors, alerts };
}

export async function runHealthCheckJob(now: Date = new Date()) {
  const [last, rules] = await Promise.all([store.lastSnapshotAt(), store.getRules()]);
  const ctx: RuleContext = {
    now, latest: null, previous: null, probes: {}, ai2h: null, ai2hLastWeek: null, lastSnapshotAt: last,
  };
  const alerts = await runAlerts({
    rules: rules.filter((r) => r.key === "collector_stale"),
    ctx,
    store,
    notify: (t) => sendTelegram(t),
  });
  const stale = !last || now.getTime() - new Date(last).getTime() > 15 * 60000;
  return { ok: true as const, stale, alerts };
}

/** Appelé à 6h et 7h UTC ; n'envoie qu'à 8h Paris (gère l'heure d'été/hiver), sauf force=1. */
export async function runDigestJob({ now = new Date(), force = false }: { now?: Date; force?: boolean }) {
  if (!force && parisHour(now) !== 8) return { ok: true as const, sent: false, skipped: "pas 8h à Paris" };
  const day = parisDayBounds(now, -1);
  const prev = parisDayBounds(now, -2);
  const [summary, snaps, alerts] = await Promise.all([
    settle(runNoesisSql(daySummarySql(day.from, day.to, prev.from)).then(mapDaySummary)),
    settle(store.snapshotsSince(day.from, day.to)),
    settle(store.alertsSince(day.from)),
  ]);
  const unavailable: string[] = [];
  if (!summary.ok) unavailable.push("activité Noesis");
  if (!snaps.ok) unavailable.push("relevés");
  if (!alerts.ok) unavailable.push("alertes");
  const s = snaps.ok ? snaps.data : [];
  const text = buildDigest({
    day: day.from,
    summary: summary.ok ? summary.data : null,
    peak: peak(s),
    groqAvailability: availability(s.map((x) => x.groq?.api.ok)),
    alerts: alerts.ok ? alerts.data.filter((a) => new Date(a.opened_at) < day.to) : [],
    unavailable,
  });
  await sendTelegram(text);
  return { ok: true as const, sent: true };
}
