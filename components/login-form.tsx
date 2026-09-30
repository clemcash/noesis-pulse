"use client";

import { useActionState } from "react";
import { sendMagicLink, type LoginState } from "@/app/login/actions";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(sendMagicLink, { sent: false });
  if (state.sent) {
    return <p className="rounded-xl bg-mint p-4 text-sm">Si cette adresse est autorisée, un lien de connexion vient d&apos;être envoyé. Vérifie ta boîte mail.</p>;
  }
  return (
    <form action={action} className="flex flex-col gap-3">
      <label htmlFor="email" className="text-sm font-medium">Email</label>
      <input id="email" name="email" type="email" required autoComplete="email"
        className="rounded-xl border border-ink/15 bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-violet" />
      <button disabled={pending} className="rounded-xl bg-ink px-4 py-3 font-semibold text-white disabled:opacity-60">
        {pending ? "Envoi…" : "Recevoir un lien de connexion"}
      </button>
    </form>
  );
}
