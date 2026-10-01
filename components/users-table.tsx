"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { FEATURE_COLOR, FEATURE_LABEL } from "@/components/bento/feature-bar";
import { formatInt, formatParis, timeAgo } from "@/lib/format";
import type { UserRow } from "@/lib/noesis/queries";

type SortKey = "lastActivity" | "createdAt" | "aiRequests" | "email";

const COLS: { key: SortKey; label: string }[] = [
  { key: "email", label: "Email" },
  { key: "createdAt", label: "Inscription" },
  { key: "lastActivity", label: "Dernière activité" },
  { key: "aiRequests", label: "Demandes IA" },
];

export function UsersTable({ users }: { users: UserRow[] }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("lastActivity");
  const [desc, setDesc] = useState(true);

  const rows = useMemo(() => {
    const filtered = users.filter((u) => u.email.toLowerCase().includes(q.trim().toLowerCase()));
    return filtered.sort((a, b) => {
      const va = a[sort] ?? "";
      const vb = b[sort] ?? "";
      const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
      return desc ? -cmp : cmp;
    });
  }, [users, q, sort, desc]);

  const click = (k: SortKey) => {
    if (k === sort) setDesc(!desc);
    else {
      setSort(k);
      setDesc(k !== "email");
    }
  };

  return (
    <div>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un email…" aria-label="Rechercher un email"
        className="mb-3 w-full rounded-xl border border-ink/10 bg-white px-4 py-2.5 outline-none focus:ring-2 focus:ring-violet sm:w-80" />
      <div className="overflow-x-auto rounded-2xl bg-white">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-ink/10 text-left">
              {COLS.map((c) => (
                <th key={c.key} className="px-4 py-3 font-semibold">
                  <button onClick={() => click(c.key)} className="hover:underline">
                    {c.label} {sort === c.key ? (desc ? "↓" : "↑") : ""}
                  </button>
                </th>
              ))}
              <th className="px-4 py-3 font-semibold">Fonctionnalités</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id} className="border-b border-ink/5 last:border-0 hover:bg-canvas/60">
                <td className="px-4 py-2.5"><Link href={`/users/${u.id}`} className="font-medium hover:underline">{u.email}</Link></td>
                <td className="px-4 py-2.5">{formatParis(u.createdAt, { day: "numeric", month: "short", year: "numeric" })}</td>
                <td className="px-4 py-2.5" suppressHydrationWarning>{u.lastActivity ? timeAgo(u.lastActivity) : "—"}</td>
                <td className="px-4 py-2.5 font-semibold">{formatInt(u.aiRequests)}</td>
                <td className="px-4 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    {u.features.map((f) => (
                      <span key={f} className="rounded-full px-2 py-0.5 text-xs text-white" style={{ background: FEATURE_COLOR[f] }}>{FEATURE_LABEL[f]}</span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="p-6 text-center text-sm opacity-60">Aucun utilisateur.</p>}
      </div>
    </div>
  );
}
