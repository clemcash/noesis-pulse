import type { ReactNode } from "react";

export function Stat({ value, sub, size = "md", pulse = false }: { value: string; sub?: ReactNode; size?: "md" | "xl"; pulse?: boolean }) {
  return (
    <div>
      <div className={`flex items-center gap-2 font-extrabold leading-none ${size === "xl" ? "text-7xl" : "text-4xl"}`}>
        {pulse && <span className="pulse-dot inline-block h-3 w-3 rounded-full bg-ok" aria-hidden />}
        {value}
      </div>
      {sub && <div className="mt-2 text-sm opacity-75">{sub}</div>}
    </div>
  );
}
