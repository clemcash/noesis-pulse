import { describe, expect, it } from "vitest";
import { isCronAuthorized } from "./cron-auth";

const req = (auth?: string) => new Request("https://x/api/collect", { method: "POST", headers: auth ? { Authorization: auth } : {} });

describe("isCronAuthorized", () => {
  it("accepte le bon secret", () => expect(isCronAuthorized(req("Bearer s3cret"), "s3cret")).toBe(true));
  it("refuse un mauvais secret", () => expect(isCronAuthorized(req("Bearer nope"), "s3cret")).toBe(false));
  it("refuse sans en-tête", () => expect(isCronAuthorized(req(), "s3cret")).toBe(false));
  it("refuse si aucun secret n'est configuré", () => expect(isCronAuthorized(req("Bearer "), "")).toBe(false));
});
