import type { Snapshot } from "./types";

export function pctChange(cur: number, prev: number): number | null {
  if (prev === 0) return null;
  return (cur - prev) / prev;
}

export function perHour(count: number, hours: number): number {
  return Math.round(count / hours);
}

export function peak(snaps: Pick<Snapshot, "taken_at" | "online">[]): { value: number; at: string } | null {
  let best: { value: number; at: string } | null = null;
  for (const s of snaps) {
    if (s.online == null) continue;
    if (!best || s.online > best.value) best = { value: s.online, at: s.taken_at };
  }
  return best;
}

export function availability(values: (boolean | null | undefined)[]): number | null {
  const known = values.filter((v): v is boolean => typeof v === "boolean");
  if (known.length === 0) return null;
  return known.filter(Boolean).length / known.length;
}
