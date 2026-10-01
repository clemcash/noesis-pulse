"use client";

import { useActionState } from "react";
import { testTelegramAction, type TestState } from "@/app/(dash)/alerts/actions";

export function TelegramTest() {
  const [state, action, pending] = useActionState<TestState>(testTelegramAction, { ok: null, message: "" });
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <button disabled={pending} className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-ink disabled:opacity-60">
        {pending ? "Envoi…" : "Tester Telegram"}
      </button>
      {state.message && <span className={`text-sm ${state.ok ? "" : "text-bad"}`}>{state.message}</span>}
    </form>
  );
}
