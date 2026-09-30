import { isCronAuthorized } from "@/lib/cron-auth";
import { runDigestJob } from "@/lib/jobs";
import { errorMessage } from "@/lib/result";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  if (!isCronAuthorized(req)) return Response.json({ error: "Non autorisé" }, { status: 401 });
  const force = new URL(req.url).searchParams.get("force") === "1";
  try {
    return Response.json(await runDigestJob({ force }));
  } catch (e) {
    console.error("[digest]", errorMessage(e));
    return Response.json({ ok: false, error: errorMessage(e) }, { status: 500 });
  }
}
