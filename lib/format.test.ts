import { describe, expect, it } from "vitest";
import { formatBytes, formatInt, formatPct, maskEmail, timeAgo } from "./format";

describe("format", () => {
  it("formatInt utilise l'espace fine française", () => {
    expect(formatInt(1204).replace(/\s/g, " ")).toBe("1 204");
  });
  it("formatBytes", () => {
    expect(formatBytes(512)).toBe("512 o");
    expect(formatBytes(212 * 1024 * 1024)).toBe("212 Mo");
    expect(formatBytes(1.5 * 1024 * 1024 * 1024)).toBe("1,5 Go");
  });
  it("formatPct", () => {
    expect(formatPct(0.643)).toBe("64 %");
  });
  it("maskEmail garde 3 caractères et le domaine", () => {
    expect(maskEmail("lea.martin@gmail.com")).toBe("lea…@gmail.com");
    expect(maskEmail("ab@x.fr")).toBe("ab…@x.fr");
    expect(maskEmail("pas-un-email")).toBe("pas…");
  });
  it("timeAgo", () => {
    const now = new Date("2026-09-30T12:00:00Z");
    expect(timeAgo("2026-09-30T11:59:40Z", now)).toBe("à l'instant");
    expect(timeAgo("2026-09-30T11:57:00Z", now)).toBe("il y a 3 min");
    expect(timeAgo("2026-09-30T09:00:00Z", now)).toBe("il y a 3 h");
    expect(timeAgo("2026-09-28T12:00:00Z", now)).toBe("il y a 2 j");
  });
});
