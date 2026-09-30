import { describe, expect, it } from "vitest";
import { parsePeriod, periodRange } from "./period";

describe("period", () => {
  it("parsePeriod retombe sur 24h", () => {
    expect(parsePeriod("7d")).toBe("7d");
    expect(parsePeriod("n'importe")).toBe("24h");
    expect(parsePeriod(undefined)).toBe("24h");
  });
  it("periodRange 7d", () => {
    const now = new Date("2026-09-30T12:00:00Z");
    const r = periodRange("7d", now);
    expect(r.hours).toBe(168);
    expect(r.bucket).toBe("hour");
    expect(r.from.toISOString()).toBe("2026-09-23T12:00:00.000Z");
    expect(r.prevFrom.toISOString()).toBe("2026-09-16T12:00:00.000Z");
    expect(r.to).toEqual(now);
  });
  it("30d utilise des tranches journalières", () => {
    expect(periodRange("30d", new Date()).bucket).toBe("day");
  });
});
