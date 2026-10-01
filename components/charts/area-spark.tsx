"use client";

import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import type { Pt } from "@/lib/data/types";
import { ChartTip } from "./tip";

export function AreaSpark({ data, color = "#ffffff", height = 72 }: { data: Pt[]; color?: string; height?: number }) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="spark-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor={color} stopOpacity={0.45} />
              <stop offset="1" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} hide />
          <Tooltip content={(p) => <ChartTip {...(p as object)} fmt="int" />} />
          <Area type="monotone" dataKey="n" name="En ligne" stroke={color} strokeWidth={2} fill="url(#spark-fill)" connectNulls isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
