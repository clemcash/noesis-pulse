import { describe, expect, it } from "vitest";
import { assertReadOnly } from "@/lib/noesis/sql";
import {
  buildBrief,
  chunkByChars,
  mapResponses,
  newResponsesSql,
  parseAnalysis,
  planChanges,
  responseForAnalysis,
  weekStats,
  type FeedbackItem,
} from "./model";

const R1 = "11111111-1111-1111-1111-111111111111";
const R2 = "22222222-2222-2222-2222-222222222222";
const R3 = "33333333-3333-3333-3333-333333333333";

const item = (over: Partial<FeedbackItem>): FeedbackItem => ({
  id: 1, kind: "bug", title: "t", detail: "", mentions: 1, response_ids: [], status: "new", batch_id: null,
  created_at: "2026-10-15T00:00:00Z", updated_at: "2026-10-15T00:00:00Z", ...over,
});

describe("lecture Noesis", () => {
  it("la requête passe le garde lecture seule", () => {
    expect(() => assertReadOnly(newResponsesSql(new Date("2026-10-10T00:00:00Z")))).not.toThrow();
  });

  it("mappe les lignes et ne garde qu'une note valide", () => {
    const [a, b] = mapResponses([
      { id: R1, user_id: R2, email: "a@b.c", week_start: "2026-10-10", track: "junior", answers: { note: 4, bugs: "x" }, created_at: "2026-10-11T10:00:00+00:00" },
      { id: R2, user_id: R2, email: null, week_start: "2026-10-10", track: null, answers: { note: 9 }, created_at: "2026-10-11T10:00:00Z" },
    ]);
    expect(a).toMatchObject({ id: R1, note: 4, track: "junior", answers: { bugs: "x" }, submitted_at: "2026-10-11T10:00:00.000Z" });
    expect(b).toMatchObject({ note: null, track: "lycee", email: null });
  });
});

describe("analyse", () => {
  it("texte d'une réponse tronqué et sans champs vides", () => {
    const t = responseForAnalysis({ id: R1, note: 3, track: "lycee", answers: { note: 3, bugs: "a".repeat(900), ia: "  " } });
    expect(t).toContain("note=3/5");
    expect(t).toContain(`bugs: ${"a".repeat(500)}`);
    expect(t).not.toContain("ia:");
  });

  it("découpe par budget de caractères", () => {
    expect(chunkByChars([5, 5, 5, 20, 1], (n) => n, 10)).toEqual([[5, 5], [5], [20], [1]]);
  });

  it("valide la sortie de l'IA", () => {
    const out = parseAnalysis(
      {
        items: [
          { existing_id: 7, kind: "bug", title: "Écran blanc", detail: "d", response_ids: [R1, R1, "inconnu"] },
          { existing_id: 99, kind: "idee", title: "Mode sombre", response_ids: [R2] },
          { kind: "pirate", title: "x", response_ids: [R1] },
          { kind: "ux", title: "", response_ids: [R1] },
          { kind: "ux", title: "Sans source", response_ids: ["autre"] },
        ],
      },
      new Set([7]),
      new Set([R1, R2]),
    );
    expect(out).toEqual([
      { existingId: 7, kind: "bug", title: "Écran blanc", detail: "d", responseIds: [R1] },
      { existingId: null, kind: "idee", title: "Mode sombre", detail: "", responseIds: [R2] },
    ]);
    expect(() => parseAnalysis({}, new Set(), new Set())).toThrow();
  });

  it("fusionne avec les points ouverts sans compter deux fois une réponse", () => {
    const changes = planChanges(
      [
        { existingId: 1, kind: "bug", title: "x", detail: "", responseIds: [R1, R2] },
        { existingId: null, kind: "idee", title: "Nouveau", detail: "d", responseIds: [R3] },
      ],
      [{ id: 1, response_ids: [R1] }],
    );
    expect(changes.updates).toEqual([{ id: 1, mentions: 2, response_ids: [R1, R2] }]);
    expect(changes.inserts).toEqual([{ kind: "idee", title: "Nouveau", detail: "d", mentions: 1, response_ids: [R3] }]);
  });
});

describe("brief", () => {
  it("trie par catégorie puis mentions et cite les testeurs", () => {
    const brief = buildBrief(
      [
        item({ id: 1, kind: "idee", title: "Export PDF", mentions: 1, response_ids: [R1] }),
        item({ id: 2, kind: "bug", title: "Crash", detail: "Au scan", mentions: 3, response_ids: [R1, R2] }),
      ],
      [
        { id: R1, answers: { bugs: "ça plante\nquand je scanne", idees: "un export" } },
        { id: R2, answers: {} },
      ],
      new Date("2026-10-17T08:00:00Z"),
    );
    expect(brief.indexOf("Crash")).toBeLessThan(brief.indexOf("Export PDF"));
    expect(brief).toContain("— 3 testeurs");
    expect(brief).toContain("> ça plante quand je scanne");
    expect(brief).toContain("> un export");
  });

  it("reste borné", () => {
    const many = Array.from({ length: 200 }, (_, i) => item({ id: i, title: "x".repeat(140), detail: "d".repeat(800) }));
    expect(buildBrief(many, [], new Date()).length).toBeLessThan(21_000);
  });
});

it("statistiques par semaine, plus récente d'abord", () => {
  expect(
    weekStats([
      { week_start: "2026-10-10", note: 4 },
      { week_start: "2026-10-17", note: 3 },
      { week_start: "2026-10-10", note: 5 },
      { week_start: "2026-10-10", note: null },
    ]),
  ).toEqual([
    { week: "2026-10-17", responses: 1, avgNote: 3 },
    { week: "2026-10-10", responses: 3, avgNote: 4.5 },
  ]);
});
