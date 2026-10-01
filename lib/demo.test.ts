import { describe, expect, it } from "vitest";
import { demo, demoSnapshots } from "./demo";

const now = new Date("2026-09-30T12:00:00Z");

describe("demo", () => {
  it("relevés déterministes toutes les 5 min", () => {
    const a = demoSnapshots(new Date("2026-09-30T11:00:00Z"), now);
    const b = demoSnapshots(new Date("2026-09-30T11:00:00Z"), now);
    expect(a.length).toBe(12);
    expect(a).toEqual(b);
  });
  it("overview complet et sans erreur", () => {
    const o = demo.overview("7d", now);
    expect(o.kpis.ok && o.series.ok && o.byFeature.ok && o.signups.ok && o.snaps.ok).toBe(true);
    if (o.series.ok) expect(o.series.data.length).toBeGreaterThanOrEqual(168);
  });
  it("utilisateurs et fiche", () => {
    const users = demo.users();
    expect(users.length).toBe(60);
    expect(demo.userDetail(users[0].id)?.user.id).toBe(users[0].id);
    expect(demo.userDetail("inconnu")).toBeNull();
  });
});
