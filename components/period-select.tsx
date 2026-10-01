import Link from "next/link";
import { PERIODS } from "@/lib/period";
import type { Period } from "@/lib/types";

const LABEL: Record<Period, string> = { "24h": "24 h", "7d": "7 j", "30d": "30 j" };

export function PeriodSelect({ current, pathname }: { current: Period; pathname: string }) {
  return (
    <div className="flex rounded-full bg-white p-1 text-sm" role="group" aria-label="Période">
      {PERIODS.map((p) => (
        <Link key={p} href={p === "24h" ? pathname : `${pathname}?period=${p}`}
          className={`rounded-full px-3 py-1 ${p === current ? "bg-ink text-white" : "hover:bg-ink/5"}`}
          aria-current={p === current ? "true" : undefined}>
          {LABEL[p]}
        </Link>
      ))}
    </div>
  );
}
