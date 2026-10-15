"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isDemo } from "@/lib/env";
import { generateSolutions, runFeedbackSync } from "@/lib/feedback/jobs";
import { setItemsStatus } from "@/lib/feedback/store";
import type { ItemStatus } from "@/lib/feedback/model";
import { errorMessage } from "@/lib/result";
import { requireUser } from "@/lib/supabase/server";

function back(kind: "ok" | "err", msg: string): never {
  revalidatePath("/feedback");
  redirect(`/feedback?${kind}=${encodeURIComponent(msg)}`);
}

const ids = (fd: FormData, name: string) =>
  fd.getAll(name).map(Number).filter((n) => Number.isSafeInteger(n) && n > 0);

export async function generateAction(fd: FormData): Promise<void> {
  await requireUser();
  const selected = ids(fd, "item");
  if (!selected.length) back("err", "Coche au moins un point à traiter.");
  if (isDemo()) back("ok", `Mode démo : ${selected.length} point(s) auraient été envoyés.`);
  let msg: string;
  try {
    const { batch } = await generateSolutions(selected);
    msg = `Lot n°${batch.id} lancé (${batch.item_ids.length} point(s)) : la pull request arrive sur GitHub d'ici quelques minutes.`;
  } catch (e) {
    back("err", errorMessage(e));
  }
  back("ok", msg);
}

const STATUSES: ItemStatus[] = ["new", "done", "rejected"];

export async function setStatusAction(fd: FormData): Promise<void> {
  await requireUser();
  const [id, status] = String(fd.get("set") ?? "").split(":");
  if (!STATUSES.includes(status as ItemStatus) || !Number(id)) back("err", "Action inconnue.");
  if (!isDemo()) await setItemsStatus([Number(id)], status as ItemStatus);
  revalidatePath("/feedback");
}

export async function syncAction(): Promise<void> {
  await requireUser();
  if (isDemo()) back("ok", "Mode démo : pas de relevé.");
  let msg: string;
  try {
    const r = await runFeedbackSync({ notify: false });
    msg = `${r.fetched} nouvelle(s) réponse(s), ${r.created} nouveau(x) point(s).${r.error ? ` Analyse interrompue : ${r.error}` : ""}`;
  } catch (e) {
    back("err", errorMessage(e));
  }
  back("ok", msg);
}
