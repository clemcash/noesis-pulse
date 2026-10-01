"use client";

import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartTip, fmtTime } from "./tip";

export function Bars({ data, bucket, height = 180 }: { data: { t: number; n: number }[]; bucket: "hour" | "day"; height?: number }) {
  const max = Math.max(0, ...data.map((d) => d.n));
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
          <XAxis dataKey="t" tickFormatter={(t) => fmtTime(Number(t), bucket === "day")} tick={{ fontSize: 11 }} minTickGap={40} />
          <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
          <Tooltip cursor={{ fill: "#7c3aed14" }} content={(p) => <ChartTip {...(p as object)} fmt="int" />} />
          <Bar dataKey="n" name="Demandes IA" radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {data.map((d) => (
              <Cell key={d.t} fill={d.n === max && max > 0 ? "#db2777" : "#7c3aed"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
