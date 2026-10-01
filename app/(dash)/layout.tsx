import { Suspense, type ReactNode } from "react";
import { AutoRefresh } from "@/components/auto-refresh";
import { Nav } from "@/components/nav";
import { getLastSnapshotAt } from "@/lib/data/meta";
import { requireUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function DashLayout({ children }: { children: ReactNode }) {
  await requireUser();
  const last = await getLastSnapshotAt();
  return (
    <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6">
      <Suspense>
        <Nav lastSnapshotAt={last} />
      </Suspense>
      <AutoRefresh seconds={60} />
      <main className="mt-5">{children}</main>
    </div>
  );
}
