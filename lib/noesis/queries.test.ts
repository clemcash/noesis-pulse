import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { makeNoesisDb, query, U1, U2, U3 } from "@/tests/noesis-fixture";
import { assertReadOnly } from "./sql";
import * as q from "./queries";

let db: PGlite;
beforeAll(async () => {
  db = await makeNoesisDb();
});

const now = () => new Date();
const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000);

describe("toutes les requêtes passent la garde lecture seule", () => {
  it.each([
    q.collectSql(),
    q.kpiSql(hoursAgo(24), hoursAgo(48)),
    q.aiSeriesSql(hoursAgo(24), now(), "hour"),
    q.byFeatureSql(hoursAgo(24)),
    q.latestSignupsSql(5),
    q.usersListSql(),
    q.userDetailSql(U1),
    q.daySummarySql(hoursAgo(24), now(), hoursAgo(48)),
  ])("%#", (sql) => {
    expect(() => assertReadOnly(sql)).not.toThrow();
    expect(sql).not.toMatch(/\b(content|question|goal|topic)\b/);
  });
});

describe("collect", () => {
  it("compte en ligne, demandes, fenêtres et tailles", async () => {
    const r = q.mapCollect(await query(db, q.collectSql()));
    expect(r.online).toBe(2); // U1 (message) + U3 (session)
    expect(r.ai5m).toBe(1);
    expect(r.byFeature5m).toEqual({ chat: 1, debates: 0, challenges: 0, documents: 0 });
    expect(r.ai2h).toBe(2); // chat -1 min + débat -1 h
    expect(r.ai2hLastWeek).toBe(1); // chat -7 j 1 h
    expect(r.dbBytes).toBeGreaterThan(0);
    expect(r.storageBytes).toBe(1500);
  });
});

describe("kpis", () => {
  it("24 h", async () => {
    const k = q.mapKpis(await query(db, q.kpiSql(hoursAgo(24), hoursAgo(48))));
    expect(k.aiCount).toBe(3); // -1 min, -1 h, -3 h
    expect(k.aiPrev).toBe(1); // défi -30 h
    expect(k.usersTotal).toBe(3);
    expect(k.usersNew).toBe(1); // U2
    expect(k.activePeriod).toBe(2); // U1, U2
    expect(k.active7d).toBe(3); // U3 via document -3 j
    expect(k.docErrors).toBe(0); // l'erreur date de -3 j, hors 24 h
  });
});

describe("séries et répartition", () => {
  it("aiSeries renvoie 24 ou 25 tranches horaires, total = 3", async () => {
    const s = q.mapSeries(await query(db, q.aiSeriesSql(hoursAgo(24), now(), "hour")));
    expect(s.length).toBeGreaterThanOrEqual(24);
    expect(s.reduce((a, p) => a + p.n, 0)).toBe(3);
  });
  it("byFeature ventile le chat par mode", async () => {
    const f = q.mapByFeature(await query(db, q.byFeatureSql(hoursAgo(24))));
    expect(f).toContainEqual({ feature: "chat", mode: "coach", n: 2 });
    expect(f).toContainEqual({ feature: "debates", mode: null, n: 1 });
  });
});

describe("utilisateurs", () => {
  it("derniers inscrits", async () => {
    const s = q.mapSignups(await query(db, q.latestSignupsSql(2)));
    expect(s.map((x) => x.email)).toEqual(["tom@ex.fr", "ines@ex.fr"]);
  });
  it("liste", async () => {
    const users = q.mapUsers(await query(db, q.usersListSql()));
    const u1 = users.find((u) => u.id === U1)!;
    expect(u1.aiRequests).toBe(3);
    expect(u1.features).toEqual(["chat"]);
    const u2 = users.find((u) => u.id === U2)!;
    expect(u2.features.sort()).toEqual(["debates"]);
    expect(users.find((u) => u.id === U3)!.features).toEqual(["documents"]);
    expect(users[0].id).toBe(U1); // activité la plus récente en premier
  });
  it("fiche", async () => {
    const d = q.mapUserDetail(await query(db, q.userDetailSql(U1)))!;
    expect(d.user.email).toBe("lea@ex.fr");
    expect(d.daily.length).toBe(31);
    expect(d.features).toContainEqual({ feature: "chat", n: 3 });
    expect(d.skills).toEqual([{ skill: "logique", avg: 70, n: 2 }]);
    expect(d.documents).toBe(0);
  });
  it("fiche inconnue → null", async () => {
    expect(q.mapUserDetail(await query(db, q.userDetailSql("44444444-4444-4444-8444-444444444444")))).toBeNull();
  });
});

describe("résumé d'une journée", () => {
  it("compte inscrits, actifs et demandes sur [from, to[ et la veille", async () => {
    const s = q.mapDaySummary(await query(db, q.daySummarySql(hoursAgo(24), now(), hoursAgo(48))));
    expect(s).toEqual({ newUsers: 1, active: 2, ai: 3, aiPrev: 1 });
  });
});
