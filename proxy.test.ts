import { describe, expect, it } from "vitest";
import { config } from "./proxy";

describe("proxy matcher", () => {
  it("garde le point de l'extension échappé à l'exécution (sinon /xico contourne l'auth)", () => {
    expect(config.matcher[0]).toContain(String.raw`.*\.(?:svg`);
    expect(config.matcher[0]).not.toContain(".*.(?:svg");
  });
});
