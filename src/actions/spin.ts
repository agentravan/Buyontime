"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { safeAction, type ActionResult } from "@/lib/errors";
import type { WheelSegment } from "@/lib/spin";
import { revealVoucher, spinOnce, type SpinOutcome } from "@/server/spin";

export async function spinAction(): Promise<ActionResult<{ outcome: SpinOutcome; segments: WheelSegment[]; segmentIndex: number }>> {
  return safeAction(async () => {
    const user = await requireUser();
    const res = await spinOnce(user);
    // A new coupon changes the deal prices shown across the store.
    revalidatePath("/", "layout");
    return res;
  });
}

export async function revealVoucherAction(spinId: string): Promise<ActionResult<SpinOutcome>> {
  return safeAction(async () => {
    const user = await requireUser();
    const outcome = await revealVoucher(user, String(spinId));
    revalidatePath("/spin");
    return outcome;
  });
}
