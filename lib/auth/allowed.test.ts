import { describe, expect, it } from "vitest";
import { isAllowedEmail } from "./allowed";

describe("isAllowedEmail", () => {
  it("insensible à la casse et aux espaces", () => expect(isAllowedEmail(" Clem@Mail.com ", "clem@mail.com")).toBe(true));
  it("refuse un autre email", () => expect(isAllowedEmail("x@mail.com", "clem@mail.com")).toBe(false));
  it("refuse si aucun email n'est configuré", () => expect(isAllowedEmail("", "")).toBe(false));
});
