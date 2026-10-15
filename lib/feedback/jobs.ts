import "server-only";
import { sendTelegram } from "@/lib/alerts/telegram";
import { runNoesisSql } from "@/lib/noesis/client";
import { errorMessage } from "@/lib/result";
import { analyzeBatch } from "./analyze";
import { dispatchSolutions } from "./github";
import {
  KIND_META,
  buildBrief,
  chunkByChars,
  mapResponses,
  newResponsesSql,
  planChanges,
  responseForAnalysis,
} from "./model";
import * as store from "./store";

/** ~4 000 jetons de réponses par appel : tient dans le quota gratuit de Groq. */
const CHARS_PER_CALL = 12_000;

/**
 * Relevé quotidien : copie les nouvelles réponses de Noesis, puis les regroupe
 * en points à traiter. Une réponse non analysée (quota, erreur) est reprise au
 * relevé suivant.
 */
export async function runFeedbackSync({ notify = true }: { notify?: boolean } = {}) {
  const since = await store.lastSubmittedAt();
  const fresh = mapResponses(await runNoesisSql(newResponsesSql(since)));
  await store.upsertResponses(fresh);

  const pending = await store.pendingResponses();
  const texts = pending.map((r) => ({ id: r.id, text: responseForAnalysis(r) }));
  let analyzed = 0;
  let created = 0;
  let stopped: string | null = null;
  for (const chunk of chunkByChars(texts, (t) => t.text.length, CHARS_PER_CALL)) {
    try {
      const open = await store.openItems();
      const analysis = await analyzeBatch(chunk, open);
      const changes = planChanges(analysis, open);
      await store.applyChanges(changes);
      await store.markAnalyzed(chunk.map((c) => c.id));
      analyzed += chunk.length;
      created += changes.inserts.length;
    } catch (e) {
      // Quota Groq ou erreur : on s'arrête, la suite sera reprise au prochain relevé.
      stopped = errorMessage(e);
      break;
    }
  }

  if (notify && (fresh.length || stopped)) {
    const lines = [`📝 Retours bêta : ${fresh.length} nouvelle${fresh.length > 1 ? "s" : ""} réponse${fresh.length > 1 ? "s" : ""}, ${created} nouveau${created > 1 ? "x" : ""} point${created > 1 ? "s" : ""} à traiter.`];
    if (stopped) lines.push(`⚠️ Analyse interrompue : ${stopped}`);
    try {
      await sendTelegram(lines.join("\n"));
    } catch {
      /* Telegram en panne : le relevé reste valide */
    }
  }
  return { ok: true as const, fetched: fresh.length, analyzed, pending: pending.length - analyzed, created, error: stopped };
}

function branchName(at: Date): string {
  return `retours-beta/${at.toISOString().slice(0, 16).replace(/[-:T]/g, "")}`;
}

/** Envoie les points choisis au workflow GitHub qui code les correctifs et ouvre une PR. */
export async function generateSolutions(itemIds: number[], now: Date = new Date()) {
  const items = (await store.itemsByIds(itemIds)).filter((i) => i.status === "new" && i.kind !== "positif");
  if (!items.length) throw new Error("Aucun point à traiter dans la sélection.");
  const responses = await store.responsesByIds([...new Set(items.flatMap((i) => i.response_ids))]);
  const brief = buildBrief(items, responses, now);
  const branch = branchName(now);
  const batch = await store.insertBatch({ item_ids: items.map((i) => i.id), branch, status: "dispatched", error: null });
  try {
    await dispatchSolutions({ brief, branch });
  } catch (e) {
    await store.updateBatch(batch.id, { status: "error", error: errorMessage(e) });
    throw e;
  }
  await store.setItemsStatus(batch.item_ids, "sent", batch.id);
  return { batch, kinds: items.map((i) => KIND_META[i.kind].label) };
}
