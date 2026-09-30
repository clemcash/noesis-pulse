import { isCronAuthorized } from "@/lib/cron-auth";
import { runHealthCheckJob } from "@/lib/jobs";
import { errorMessage } from "@/lib/result";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!isCronAuthorized(req)) return Response.json({ error: "Non autorisé" }, { status: 401 });
  try {
    return Response.json(await runHealthCheckJob());
  } catch (e) {
    console.error("[health-check]", errorMessage(e));
    return Response.json({ ok: false, error: errorMessage(e) }, { status: 500 });
  }
}
