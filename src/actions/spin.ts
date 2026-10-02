"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { safeAction, type ActionResult } from "@/lib/errors";
import { revealVoucher, spinOnce, type SpinOutcome } from "@/server/spin";

export async function spinAction(): Promise<ActionResult<{ outcome: SpinOutcome; segmentIndex: number; alreadySpun: boolean }>> {
  return safeAction(async () => {
    const user = await requireUser();
    const res = await spinOnce(user);
    revalidatePath("/spin");
    return res;
  });
}

export async function revealVoucherAction(): Promise<ActionResult<SpinOutcome>> {
  return safeAction(async () => {
    const user = await requireUser();
    const outcome = await revealVoucher(user);
    revalidatePath("/spin");
    return outcome;
  });
}
