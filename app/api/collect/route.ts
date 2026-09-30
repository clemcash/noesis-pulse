import { isCronAuthorized } from "@/lib/cron-auth";
import { runCollectJob } from "@/lib/jobs";
import { errorMessage } from "@/lib/result";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  if (!isCronAuthorized(req)) return Response.json({ error: "Non autorisé" }, { status: 401 });
  try {
    return Response.json(await runCollectJob());
  } catch (e) {
    console.error("[collect]", errorMessage(e));
    return Response.json({ ok: false, error: errorMessage(e) }, { status: 500 });
  }
}
