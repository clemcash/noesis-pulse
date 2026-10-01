"use client";

import { formatBytes, formatInt, formatParis } from "@/lib/format";

export type Fmt = "ms" | "bytes" | "int" | "pct";

export function fmtValue(v: number, fmt: Fmt): string {
  if (fmt === "ms") return v >= 1000 ? `${(v / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} s` : `${Math.round(v)} ms`;
  if (fmt === "bytes") return formatBytes(v);
  if (fmt === "pct") return `${Math.round(v * 100)} %`;
  return formatInt(v);
}

export function fmtTime(t: number, withDay: boolean): string {
  return formatParis(new Date(t).toISOString(), withDay ? { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" } : { hour: "2-digit", minute: "2-digit" });
}

export type TipPayload = { name?: string; value?: number | null; color?: string }[];

type TipProps = {
  active?: boolean;
  label?: number | string;
  payload?: TipPayload;
  fmt: Fmt;
};

export function ChartTip({ active, label, payload, fmt }: TipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl bg-ink px-3 py-2 text-xs text-white shadow-lg">
      <div className="mb-1 opacity-70">{fmtTime(Number(label), true)}</div>
      {payload.filter((p) => p.value != null).map((p) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          {p.name} : <b>{fmtValue(Number(p.value), fmt)}</b>
        </div>
      ))}
    </div>
  );
}
