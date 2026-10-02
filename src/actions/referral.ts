"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { safeAction, type ActionResult } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { chooseReferralCode, claimGift, type CodeCheck, type Gift } from "@/server/referral";

export async function chooseReferralCodeAction(code: string): Promise<ActionResult<CodeCheck>> {
  return safeAction(async () => {
    const user = await requireUser();
    await rateLimit(`referral-code:${user.id}`, 20, 600);
    const res = await chooseReferralCode(user, String(code ?? ""));
    if (res.ok) revalidatePath("/account/refer");
    return res;
  });
}

export async function claimGiftAction(what: { friendId?: string; milestone?: number }): Promise<ActionResult<Gift>> {
  return safeAction(async () => {
    const user = await requireUser();
    await rateLimit(`referral-claim:${user.id}`, 30, 600);
    const gift = await claimGift(user, what ?? {});
    revalidatePath("/account/refer");
    return gift;
  });
}
