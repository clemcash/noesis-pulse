import { describe, expect, it } from "vitest";
import { availability, pctChange, peak, perHour } from "./stats";

describe("stats", () => {
  it("pctChange", () => {
    expect(pctChange(112, 100)).toBeCloseTo(0.12);
    expect(pctChange(5, 0)).toBeNull();
  });
  it("perHour arrondit", () => {
    expect(perHour(3412, 24)).toBe(142);
  });
  it("peak ignore les null", () => {
    expect(
      peak([
        { taken_at: "a", online: 3 },
        { taken_at: "b", online: null },
        { taken_at: "c", online: 27 },
      ]),
    ).toEqual({ value: 27, at: "c" });
    expect(peak([])).toBeNull();
  });
  it("availability ne compte que les valeurs connues", () => {
    expect(availability([true, true, false, null, undefined])).toBeCloseTo(2 / 3);
    expect(availability([null])).toBeNull();
  });
});
