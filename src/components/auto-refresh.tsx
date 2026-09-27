"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Re-fetches server components periodically (e.g. while waiting for a payment webhook). */
export function AutoRefresh({ intervalMs = 5000, maxTimes = 10 }: { intervalMs?: number; maxTimes?: number }) {
  const router = useRouter();
  useEffect(() => {
    let n = 0;
    const id = setInterval(() => {
      n += 1;
      router.refresh();
      if (n >= maxTimes) clearInterval(id);
    }, intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs, maxTimes]);
  return null;
}
