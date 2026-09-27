"use client";

import { useSyncExternalStore } from "react";

/** True once React has hydrated on the client. Used to keep submit buttons disabled until handlers are attached. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
}
