import "server-only";
import { isDemo } from "@/lib/env";
import { settle, type Result } from "@/lib/result";
import type { FeedbackItem, FeedbackResponse, SolutionBatch } from "./model";
import * as store from "./store";

export type FeedbackPageData = {
  items: Result<FeedbackItem[]>;
  responses: Result<FeedbackResponse[]>;
  batches: Result<SolutionBatch[]>;
};

export async function getFeedbackPage(): Promise<FeedbackPageData> {
  if (isDemo()) return demoFeedback(new Date());
  const [items, responses, batches] = await Promise.all([
    settle(store.allItems()),
    settle(store.recentResponses(300)),
    settle(store.recentBatches(20)),
  ]);
  return { items, responses, batches };
}

function demoFeedback(now: Date): FeedbackPageData {
  const iso = (daysAgo: number) => new Date(now.getTime() - daysAgo * 86400_000).toISOString();
  const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const responses: FeedbackResponse[] = [
    { id: id(1), user_id: id(101), email: "lea@exemple.fr", week_start: "2026-10-10", track: "lycee", note: 4, answers: { note: 4, utile: "Le prof qui me pose des questions au lieu de donner la réponse.", bugs: "Le scan d'une photo de cours reste bloqué à 90 %.", ia: "Parfois trop de questions d'affilée, je décroche.", idees: "Pouvoir exporter mes fiches en PDF." }, submitted_at: iso(4), analyzed_at: iso(3) },
    { id: id(2), user_id: id(102), email: "tom@exemple.fr", week_start: "2026-10-10", track: "junior", note: 5, answers: { note: 5, utile: "Les défis !", bugs: "Le scan bloque sur mon téléphone.", idees: "Des badges quand je réussis." }, submitted_at: iso(3), analyzed_at: iso(2) },
    { id: id(3), user_id: id(103), email: "ines@exemple.fr", week_start: "2026-10-10", track: "lycee", note: 3, answers: { note: 3, ia: "Les réponses sont longues, j'aimerais une version courte.", idees: "Choisir la taille du texte." }, submitted_at: iso(2), analyzed_at: iso(1) },
    { id: id(4), user_id: id(104), email: "sam@exemple.fr", week_start: "2026-10-03", track: "lycee", note: 4, answers: { note: 4, utile: "La carte des cours." }, submitted_at: iso(9), analyzed_at: iso(8) },
  ];
  const item = (o: Partial<FeedbackItem> & Pick<FeedbackItem, "id" | "kind" | "title">): FeedbackItem => ({
    detail: "", mentions: 1, response_ids: [], status: "new", batch_id: null, created_at: iso(3), updated_at: iso(1), ...o,
  });
  return {
    responses: { ok: true, data: [...responses].sort((a, b) => (a.submitted_at < b.submitted_at ? 1 : -1)) },
    items: {
      ok: true,
      data: [
        item({ id: 1, kind: "bug", title: "Le scan de photo reste bloqué à 90 %", detail: "Deux testeurs (dont un sur téléphone) n'arrivent pas à terminer la numérisation d'un cours.", mentions: 2, response_ids: [id(1), id(2)] }),
        item({ id: 2, kind: "ia", title: "Réponses de l'IA trop longues", detail: "Envie d'une version plus courte et de moins de questions enchaînées.", mentions: 2, response_ids: [id(1), id(3)] }),
        item({ id: 3, kind: "ux", title: "Pouvoir choisir la taille du texte", detail: "Réglage d'affichage demandé pour lire plus confortablement.", response_ids: [id(3)] }),
        item({ id: 4, kind: "idee", title: "Exporter ses fiches en PDF", response_ids: [id(1)] }),
        item({ id: 5, kind: "idee", title: "Badges de réussite en junior", response_ids: [id(2)] }),
        item({ id: 6, kind: "positif", title: "Le prof qui fait réfléchir plaît", mentions: 2, response_ids: [id(1), id(2)] }),
        item({ id: 7, kind: "bug", title: "Bouton « Continuer » invisible en junior", status: "sent", batch_id: 1, response_ids: [id(4)] }),
      ],
    },
    batches: {
      ok: true,
      data: [{ id: 1, created_at: iso(6), item_ids: [7], branch: "retours-beta/202610090800", status: "dispatched", error: null }],
    },
  };
}
