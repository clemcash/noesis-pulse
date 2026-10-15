import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isAllowedEmail } from "@/lib/auth/allowed";
import { isDemo } from "@/lib/env";

// Sans session : pages de connexion + routes appelées par pg_cron (protégées par CRON_SECRET).
const PUBLIC = ["/login", "/auth/callback", "/api/collect", "/api/digest", "/api/health-check", "/api/feedback-sync"];

export async function proxy(req: NextRequest) {
  if (isDemo()) return NextResponse.next();
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return NextResponse.next();

  let res = NextResponse.next({ request: req });
  const sb = createServerClient(process.env.NEXT_PUBLIC_PULSE_SUPABASE_URL!, process.env.NEXT_PUBLIC_PULSE_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => req.cookies.set(name, value));
        res = NextResponse.next({ request: req });
        list.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
      },
    },
  });
  const { data } = await sb.auth.getUser();
  if (isAllowedEmail(data.user?.email ?? "", process.env.ALLOWED_EMAIL ?? "")) return res;

  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
