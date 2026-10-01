export type Health = "ok" | "warn" | "bad" | "unknown";

const PILL: Record<Health, string> = {
  ok: "bg-ok text-green-950",
  warn: "bg-warn text-amber-950",
  bad: "bg-bad text-red-950",
  unknown: "bg-white/20 text-white",
};

export function HealthRow({ label, value, status }: { label: string; value: string; status: Health }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span className="opacity-90">{label}</span>
      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${PILL[status]}`}>{value}</span>
    </div>
  );
}

export function ratioHealth(r: number | null | undefined): Health {
  if (r == null) return "unknown";
  return r > 0.8 ? "bad" : r > 0.6 ? "warn" : "ok";
}

export function latencyHealth(ms: number | null | undefined, ok = true): Health {
  if (!ok) return "bad";
  if (ms == null) return "unknown";
  return ms > 5000 ? "bad" : ms > 2000 ? "warn" : "ok";
}
