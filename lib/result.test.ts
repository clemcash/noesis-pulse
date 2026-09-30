import { describe, expect, it } from "vitest";
import { errorMessage, settle } from "./result";

describe("settle", () => {
  it("enveloppe une valeur résolue", async () => {
    expect(await settle(Promise.resolve(42))).toEqual({ ok: true, data: 42 });
  });
  it("enveloppe une erreur sans la propager", async () => {
    expect(await settle(Promise.reject(new Error("boom")))).toEqual({ ok: false, error: "boom" });
  });
});

describe("errorMessage", () => {
  it("gère les non-Error", () => {
    expect(errorMessage("x")).toBe("x");
    expect(errorMessage(null)).toBe("Erreur inconnue");
  });
});
