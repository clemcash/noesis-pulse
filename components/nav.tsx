"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { timeAgo } from "@/lib/format";
import { parsePeriod } from "@/lib/period";
import { PeriodSelect } from "./period-select";

const LINKS = [
  { href: "/", label: "Vue d'ensemble" },
  { href: "/users", label: "Utilisateurs" },
  { href: "/apis", label: "IA & APIs" },
  { href: "/feedback", label: "Retours bêta" },
  { href: "/alerts", label: "Alertes" },
];

export function Nav({ lastSnapshotAt }: { lastSnapshotAt: string | null }) {
  const pathname = usePathname();
  const period = parsePeriod(useSearchParams().get("period"));
  const q = period === "24h" ? "" : `?period=${period}`;
  const active = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  return (
    <header className="flex flex-wrap items-center gap-2">
      <Link href={`/${q}`} className="mr-3 flex items-center gap-2 text-lg font-bold">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet to-rose text-white">◆</span>
        Noesis Pulse
      </Link>
      <nav className="flex flex-wrap gap-1.5 text-sm">
        {LINKS.map((l) => (
          <Link key={l.href} href={`${l.href}${q}`}
            className={`rounded-full px-3.5 py-1.5 ${active(l.href) ? "bg-ink text-white" : "bg-white hover:bg-white/70"}`}>
            {l.label}
          </Link>
        ))}
      </nav>
      <div className="ml-auto flex items-center gap-3">
        <span className="text-xs opacity-60" suppressHydrationWarning>
          {lastSnapshotAt ? `Relevé ${timeAgo(lastSnapshotAt)}` : "Aucun relevé"}
        </span>
        {!pathname.startsWith("/alerts") && !pathname.startsWith("/feedback") && !/^\/users\/.+/.test(pathname) && <PeriodSelect current={period} pathname={pathname} />}
      </div>
    </header>
  );
}
