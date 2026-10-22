import { afterEach, describe, expect, it, vi } from "vitest";
import { isLocal } from "./env";

describe("isLocal", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("actif avec PULSE_LOCAL=1 hors production", () => {
    vi.stubEnv("PULSE_LOCAL", "1");
    vi.stubEnv("NODE_ENV", "development");
    expect(isLocal()).toBe(true);
  });

  it("jamais en production (pas de contournement de la connexion)", () => {
    vi.stubEnv("PULSE_LOCAL", "1");
    vi.stubEnv("NODE_ENV", "production");
    expect(isLocal()).toBe(false);
  });

  it("inactif sans la variable", () => {
    vi.stubEnv("PULSE_LOCAL", "");
    expect(isLocal()).toBe(false);
  });
});
