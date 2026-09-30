import { describe, expect, it } from "vitest";
import { parisDayBounds, parisHour } from "./time";

describe("time", () => {
  it("parisHour en heure d'été (UTC+2)", () => {
    expect(parisHour(new Date("2026-09-30T06:30:00Z"))).toBe(8);
  });
  it("parisHour en heure d'hiver (UTC+1)", () => {
    expect(parisHour(new Date("2026-12-01T07:30:00Z"))).toBe(8);
  });
  it("parisDayBounds(now, -1) = la veille à Paris", () => {
    const { from, to } = parisDayBounds(new Date("2026-09-30T06:00:00Z"), -1);
    expect(from.toISOString()).toBe("2026-09-28T22:00:00.000Z");
    expect(to.toISOString()).toBe("2026-09-29T22:00:00.000Z");
  });
  it("parisDayBounds gère le passage à l'heure d'hiver (journée de 25 h)", () => {
    const { from, to } = parisDayBounds(new Date("2026-10-26T10:00:00Z"), -1);
    expect(from.toISOString()).toBe("2026-10-24T22:00:00.000Z");
    expect(to.toISOString()).toBe("2026-10-25T23:00:00.000Z");
  });
});
