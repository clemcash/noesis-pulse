import "server-only";
import { demo } from "@/lib/demo";
import { isDemo } from "@/lib/env";
import * as store from "@/lib/store";

export async function getLastSnapshotAt(): Promise<string | null> {
  if (isDemo()) return demo.lastSnapshotAt(new Date());
  try {
    return await store.lastSnapshotAt();
  } catch {
    return null;
  }
}
