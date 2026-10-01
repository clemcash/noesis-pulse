import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearMemo, memo } from "./memo";

beforeEach(() => clearMemo());

describe("memo", () => {
  it("réutilise la valeur pendant le TTL puis recalcule", async () => {
    const fn = vi.fn(async () => 1);
    await memo("k", 1000, fn, 0);
    await memo("k", 1000, fn, 500);
    expect(fn).toHaveBeenCalledTimes(1);
    await memo("k", 1000, fn, 1500);
    expect(fn).toHaveBeenCalledTimes(2);
  });
  it("n'enregistre pas un échec", async () => {
    const bad = vi.fn(async () => {
      throw new Error("x");
    });
    await expect(memo("e", 1000, bad, 0)).rejects.toThrow("x");
    await new Promise((r) => setTimeout(r, 0));
    const good = vi.fn(async () => 2);
    expect(await memo("e", 1000, good, 10)).toBe(2);
  });
});
