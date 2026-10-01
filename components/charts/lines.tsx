"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartTip, fmtTime, fmtValue, type Fmt } from "./tip";

export function Lines({ data, series, fmt, height = 220 }: {
  data: Record<string, number | null>[];
  series: { key: string; label: string; color: string }[];
  fmt: Fmt;
  height?: number;
}) {
  const span = data.length > 1 ? Number(data.at(-1)!.t) - Number(data[0].t) : 0;
  const withDay = span > 36 * 3600_000;
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="#1a103312" vertical={false} />
          <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} scale="time" tickFormatter={(t) => fmtTime(Number(t), withDay)} tick={{ fontSize: 11 }} minTickGap={50} />
          <YAxis tickFormatter={(v) => fmtValue(Number(v), fmt)} tick={{ fontSize: 11 }} width={64} />
          <Tooltip content={(p) => <ChartTip {...(p as object)} fmt={fmt} />} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {series.map((s) => (
            <Line key={s.key} dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
