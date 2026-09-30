import { describe, expect, it, vi } from "vitest";
import type { Alert, AlertRule, RuleKey } from "@/lib/types";
import { MODELS } from "@/lib/types";
import type { RuleContext } from "./rules";
import { runAlerts } from "./run";

const ctx: RuleContext = {
  now: new Date("2026-09-30T12:00:00Z"), latest: null, previous: null,
  probes: {
    [MODELS.primary]: {
      ok: true, latencyMs: 9000, remainingRequests: null, limitRequests: null, remainingTokens: null, limitTokens: null,
      probedAt: "2026-09-30T11:50:00Z",
    },
  },
  ai2h: null, ai2hLastWeek: null, lastSnapshotAt: "2026-09-30T11:50:00Z",
};
const rules: AlertRule[] = [
  { key: "groq_slow", enabled: true, threshold: 5000, params: {} },
  { key: "collector_stale", enabled: true, threshold: 15, params: {} },
];

function fakeStore(open: Alert[]) {
  return {
    openAlerts: vi.fn(async () => open),
    insertAlert: vi.fn(async (rule_key: RuleKey, message: string): Promise<Alert> => ({ id: 1, rule_key, message, opened_at: "", resolved_at: null })),
    resolveAlert: vi.fn(async () => {}),
  };
}

describe("runAlerts", () => {
  it("ouvre, résout, notifie", async () => {
    const store = fakeStore([{ id: 7, rule_key: "collector_stale", opened_at: "", resolved_at: null, message: "" }]);
    const notify = vi.fn(async () => {});
    const r = await runAlerts({ rules, ctx, store, notify });
    expect(r).toEqual({ opened: ["groq_slow"], resolved: ["collector_stale"], notifyErrors: [] });
    expect(store.insertAlert).toHaveBeenCalledWith("groq_slow", "🐢 Groq gpt-oss-120b lent : 9 s (seuil 5 s)");
    expect(store.resolveAlert).toHaveBeenCalledWith(7, ctx.now);
    expect(notify).toHaveBeenCalledTimes(2);
  });
  it("un échec Telegram n'empêche pas la persistance", async () => {
    const store = fakeStore([]);
    const notify = vi.fn(async () => {
      throw new Error("Telegram 400");
    });
    const r = await runAlerts({ rules, ctx, store, notify });
    expect(store.insertAlert).toHaveBeenCalled();
    expect(r.notifyErrors).toEqual(["Telegram 400"]);
  });
});
