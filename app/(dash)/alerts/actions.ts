"use server";

import { revalidatePath } from "next/cache";
import { RULE_META } from "@/lib/alerts/rules";
import { sendTelegram } from "@/lib/alerts/telegram";
import { isDemo } from "@/lib/env";
import { errorMessage } from "@/lib/result";
import { updateRule } from "@/lib/store";
import { requireUser } from "@/lib/supabase/server";
import type { RuleKey } from "@/lib/types";

export type TestState = { ok: boolean | null; message: string };

export async function updateRuleAction(fd: FormData): Promise<void> {
  await requireUser();
  if (isDemo()) return;
  const key = String(fd.get("key")) as RuleKey;
  if (!(key in RULE_META)) throw new Error("Règle inconnue");
  const enabled = fd.get("enabled") === "on";
  const raw = fd.get("threshold");
  if (raw == null || raw === "") {
    await updateRule(key, { enabled });
  } else {
    const threshold = Number(raw);
    if (!Number.isFinite(threshold) || threshold < 0) throw new Error("Seuil invalide");
    await updateRule(key, { enabled, threshold });
  }
  revalidatePath("/alerts");
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function testTelegramAction(_prev: TestState): Promise<TestState> {
  await requireUser();
  if (isDemo()) return { ok: false, message: "Mode démo : Telegram n'est pas configuré." };
  try {
    await sendTelegram("🧪 Test Noesis Pulse : les alertes arrivent bien ici.");
    return { ok: true, message: "Message envoyé ✅" };
  } catch (e) {
    return { ok: false, message: errorMessage(e) };
  }
}
