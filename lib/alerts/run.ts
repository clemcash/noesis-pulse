import type { AlertStore } from "@/lib/store";
import { errorMessage } from "@/lib/result";
import type { AlertRule, RuleKey } from "@/lib/types";
import { diffAlerts, type RuleContext } from "./rules";

export async function runAlerts(args: {
  rules: AlertRule[];
  ctx: RuleContext;
  store: AlertStore;
  notify: (text: string) => Promise<void>;
}): Promise<{ opened: RuleKey[]; resolved: RuleKey[]; notifyErrors: string[] }> {
  const open = await args.store.openAlerts();
  const { toOpen, toResolve } = diffAlerts(args.rules, args.ctx, open);
  const messages: string[] = [];

  for (const a of toOpen) {
    await args.store.insertAlert(a.rule_key, a.message);
    messages.push(a.message);
  }
  for (const r of toResolve) {
    await args.store.resolveAlert(r.alert.id, args.ctx.now);
    messages.push(r.message);
  }

  const notifyErrors: string[] = [];
  for (const m of messages) {
    try {
      await args.notify(m);
    } catch (e) {
      notifyErrors.push(errorMessage(e));
    }
  }
  return { opened: toOpen.map((a) => a.rule_key), resolved: toResolve.map((r) => r.alert.rule_key), notifyErrors };
}
