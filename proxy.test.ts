import { describe, expect, it } from "vitest";
import { config } from "./proxy";

describe("proxy matcher", () => {
  it("échappe le point de l'extension (sinon /xico contourne l'auth)", () => {
    expect(config.matcher[0]).toContain(".*\.(?:svg");
  });
});
