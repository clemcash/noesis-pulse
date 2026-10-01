"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Recharge les données serveur toutes les N secondes quand l'onglet est visible. */
export function AutoRefresh({ seconds = 60 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}
