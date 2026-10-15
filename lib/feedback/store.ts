import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import type { FeedbackItem, FeedbackResponse, ItemChanges, ItemStatus, SolutionBatch } from "./model";

let client: SupabaseClient | null = null;

function db(): SupabaseClient {
  client ??= createClient(env.pulseUrl, env.pulseServiceKey, { auth: { persistSession: false } });
  return client;
}

function check<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(`Base Pulse : ${r.error.message}`);
  return r.data as T;
}

const nowIso = () => new Date().toISOString();

export async function lastSubmittedAt(): Promise<Date> {
  const rows = check(
    await db().from("feedback_responses").select("submitted_at").order("submitted_at", { ascending: false }).limit(1),
  ) as { submitted_at: string }[];
  return rows[0] ? new Date(rows[0].submitted_at) : new Date(0);
}

export async function upsertResponses(rows: Omit<FeedbackResponse, "analyzed_at">[]): Promise<void> {
  if (!rows.length) return;
  // ignoreDuplicates : ne remet jamais à zéro analyzed_at d'une réponse déjà analysée.
  check(await db().from("feedback_responses").upsert(rows, { onConflict: "id", ignoreDuplicates: true }));
}

export async function pendingResponses(limit = 200): Promise<FeedbackResponse[]> {
  return check(
    await db().from("feedback_responses").select("*").is("analyzed_at", null).order("submitted_at").limit(limit),
  ) as FeedbackResponse[];
}

export async function markAnalyzed(ids: string[]): Promise<void> {
  if (!ids.length) return;
  check(await db().from("feedback_responses").update({ analyzed_at: nowIso() }).in("id", ids));
}

export async function recentResponses(limit: number): Promise<FeedbackResponse[]> {
  return check(
    await db().from("feedback_responses").select("*").order("submitted_at", { ascending: false }).limit(limit),
  ) as FeedbackResponse[];
}

export async function responsesByIds(ids: string[]): Promise<FeedbackResponse[]> {
  if (!ids.length) return [];
  return check(await db().from("feedback_responses").select("*").in("id", ids)) as FeedbackResponse[];
}

/** Points sur lesquels l'IA peut encore regrouper (nouveaux ou envoyés, pas clos). */
export async function openItems(): Promise<FeedbackItem[]> {
  return check(
    await db().from("feedback_items").select("*").in("status", ["new", "sent"]).order("mentions", { ascending: false }).limit(150),
  ) as FeedbackItem[];
}

export async function allItems(): Promise<FeedbackItem[]> {
  return check(
    await db().from("feedback_items").select("*").order("updated_at", { ascending: false }).limit(500),
  ) as FeedbackItem[];
}

export async function itemsByIds(ids: number[]): Promise<FeedbackItem[]> {
  if (!ids.length) return [];
  return check(await db().from("feedback_items").select("*").in("id", ids)) as FeedbackItem[];
}

export async function applyChanges(c: ItemChanges): Promise<void> {
  for (const u of c.updates) {
    check(
      await db()
        .from("feedback_items")
        .update({ mentions: u.mentions, response_ids: u.response_ids, updated_at: nowIso() })
        .eq("id", u.id),
    );
  }
  if (c.inserts.length) check(await db().from("feedback_items").insert(c.inserts));
}

export async function setItemsStatus(ids: number[], status: ItemStatus, batchId?: number): Promise<void> {
  if (!ids.length) return;
  const patch: Record<string, unknown> = { status, updated_at: nowIso() };
  if (batchId !== undefined) patch.batch_id = batchId;
  check(await db().from("feedback_items").update(patch).in("id", ids));
}

export async function insertBatch(b: Omit<SolutionBatch, "id" | "created_at">): Promise<SolutionBatch> {
  return check(await db().from("solution_batches").insert(b).select().single()) as SolutionBatch;
}

export async function updateBatch(id: number, patch: Partial<Pick<SolutionBatch, "status" | "error">>): Promise<void> {
  check(await db().from("solution_batches").update(patch).eq("id", id));
}

export async function recentBatches(limit: number): Promise<SolutionBatch[]> {
  return check(
    await db().from("solution_batches").select("*").order("created_at", { ascending: false }).limit(limit),
  ) as SolutionBatch[];
}
