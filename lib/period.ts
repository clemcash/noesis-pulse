import type { Period } from "./types";

export const PERIODS: Period[] = ["24h", "7d", "30d"];

const CONF: Record<Period, { hours: number; bucket: "hour" | "day"; label: string }> = {
  "24h": { hours: 24, bucket: "hour", label: "24 h" },
  "7d": { hours: 168, bucket: "hour", label: "7 jours" },
  "30d": { hours: 720, bucket: "day", label: "30 jours" },
};

export function parsePeriod(v: unknown): Period {
  return typeof v === "string" && (PERIODS as string[]).includes(v) ? (v as Period) : "24h";
}

export function periodRange(p: Period, now: Date) {
  const { hours, bucket, label } = CONF[p];
  const ms = hours * 3600_000;
  return {
    from: new Date(now.getTime() - ms),
    to: now,
    prevFrom: new Date(now.getTime() - 2 * ms),
    hours,
    bucket,
    label,
  };
}
