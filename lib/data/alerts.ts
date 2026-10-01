import "server-only";
import { demo } from "@/lib/demo";
import { isDemo } from "@/lib/env";
import { settle } from "@/lib/result";
import * as store from "@/lib/store";
import type { AlertsPageData } from "./types";

export async function getAlertsPage(): Promise<AlertsPageData> {
  if (isDemo()) return demo.alertsPage();
  const [rules, alerts] = await Promise.all([settle(store.getRules()), settle(store.recentAlerts(50))]);
  return { rules, alerts };
}
