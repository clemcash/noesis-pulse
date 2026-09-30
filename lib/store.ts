import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import type { Alert, AlertRule, RuleKey, Snapshot } from "@/lib/types";

let client: SupabaseClient | null = null;

function db(): SupabaseClient {
  client ??= createClient(env.pulseUrl, env.pulseServiceKey, { auth: { persistSession: false } });
  return client;
}

function check<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(`Base Pulse : ${r.error.message}`);
  return r.data as T;
}

export async function insertSnapshot(s: Snapshot): Promise<Snapshot> {
  const { id: _omit, ...row } = s;
  void _omit;
  return check(await db().from("snapshots").insert(row).select().single()) as Snapshot;
}

export async function recentSnapshots(limit: number): Promise<Snapshot[]> {
  return check(await db().from("snapshots").select("*").order("taken_at", { ascending: false }).limit(limit)) as Snapshot[];
}

export async function snapshotsSince(from: Date, to: Date = new Date()): Promise<Snapshot[]> {
  const out: Snapshot[] = [];
  const page = 1000;
  for (let i = 0; ; i += page) {
    const rows = check(
      await db()
        .from("snapshots")
        .select("*")
        .gte("taken_at", from.toISOString())
        .lt("taken_at", to.toISOString())
        .order("taken_at", { ascending: true })
        .range(i, i + page - 1),
    ) as Snapshot[];
    out.push(...rows);
    if (rows.length < page) return out;
  }
}

export async function lastSnapshotAt(): Promise<string | null> {
  const rows = check(await db().from("snapshots").select("taken_at").order("taken_at", { ascending: false }).limit(1)) as {
    taken_at: string;
  }[];
  return rows[0]?.taken_at ?? null;
}

export async function purgeSnapshots(before: Date): Promise<void> {
  check(await db().from("snapshots").delete().lt("taken_at", before.toISOString()));
}

export async function getRules(): Promise<AlertRule[]> {
  const rows = check(await db().from("alert_rules").select("*").order("key")) as AlertRule[];
  return rows.map((r) => ({ ...r, threshold: Number(r.threshold), params: r.params ?? {} }));
}

export async function updateRule(key: RuleKey, patch: { enabled?: boolean; threshold?: number }): Promise<void> {
  check(await db().from("alert_rules").update(patch).eq("key", key));
}

export async function openAlerts(): Promise<Alert[]> {
  return check(await db().from("alerts").select("*").is("resolved_at", null)) as Alert[];
}

export async function insertAlert(rule_key: RuleKey, message: string): Promise<Alert> {
  return check(await db().from("alerts").insert({ rule_key, message }).select().single()) as Alert;
}

export async function resolveAlert(id: number, at: Date): Promise<void> {
  check(await db().from("alerts").update({ resolved_at: at.toISOString() }).eq("id", id));
}

export async function alertsSince(from: Date): Promise<Alert[]> {
  return check(
    await db().from("alerts").select("*").gte("opened_at", from.toISOString()).order("opened_at", { ascending: false }),
  ) as Alert[];
}

export async function recentAlerts(limit: number): Promise<Alert[]> {
  return check(await db().from("alerts").select("*").order("opened_at", { ascending: false }).limit(limit)) as Alert[];
}

export type AlertStore = {
  openAlerts: typeof openAlerts;
  insertAlert: typeof insertAlert;
  resolveAlert: typeof resolveAlert;
};
