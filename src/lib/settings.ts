import "server-only";
import { cache } from "react";
import type { StoreSettings } from "@prisma/client";
import { db } from "@/lib/db";

/** Loads the singleton settings row, creating it with defaults on first use. Memoised per request. */
export const getSettings = cache(async (): Promise<StoreSettings> => {
  const existing = await db.storeSettings.findUnique({ where: { id: "store" } });
  if (existing) return existing;
  return db.storeSettings.upsert({ where: { id: "store" }, update: {}, create: { id: "store" } });
});
