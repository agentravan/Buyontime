"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { safeAction, type ActionResult } from "@/lib/errors";
import { memberRule, repriceVerdict } from "@/lib/membership";
import { getSettings } from "@/lib/settings";
import { cancelMemberReward, cancelMembership, sendMemberReward, syncAllMemberRewards } from "@/server/membership";

export async function sendMemberRewardAction(rewardId: string, input: { brand: string; code: string }): Promise<ActionResult<null>> {
  return safeAction(async () => {
    const actor = await requirePermission("customers:manage");
    const d = z.object({ brand: z.enum(["Amazon", "Flipkart"]), code: z.string().trim().min(4).max(120) }).parse(input);
    await sendMemberReward(z.string().min(5).parse(rewardId), actor, d);
    revalidatePath("/admin/membership");
    return null;
  }, "Voucher code sent to the customer");
}

export async function cancelMemberRewardAction(rewardId: string): Promise<ActionResult<null>> {
  return safeAction(async () => {
    const actor = await requirePermission("customers:manage");
    await cancelMemberReward(z.string().min(5).parse(rewardId), actor);
    revalidatePath("/admin/membership");
    return null;
  }, "Reward cancelled");
}

export async function cancelMembershipAction(membershipId: string, note: string): Promise<ActionResult<null>> {
  return safeAction(async () => {
    const actor = await requirePermission("customers:manage");
    await cancelMembership(z.string().min(5).parse(membershipId), actor, z.string().max(300).parse(note ?? ""));
    revalidatePath("/admin/membership");
    return null;
  }, "Membership cancelled");
}

export async function syncMemberRewardsAction(): Promise<ActionResult<{ created: number }>> {
  return safeAction(async () => {
    await requirePermission("customers:manage");
    const created = await syncAllMemberRewards();
    revalidatePath("/admin/membership");
    return { created };
  });
}

/**
 * Sets every product's regular price to cost + regular profit (₹180 by default), never above MRP.
 * Products without a cost, and products where that price would exceed MRP, are left unchanged.
 * Variant price overrides are not touched.
 */
export async function applyMemberPricingAction(): Promise<ActionResult<{ changed: number; skippedNoCost: number; skippedAboveMrp: number }>> {
  return safeAction(async () => {
    const actor = await requirePermission("products:manage");
    const settings = await getSettings();
    const rule = memberRule(settings);
    const products = await db.product.findMany({
      where: { deletedAt: null },
      select: { id: true, sku: true, price: true, mrp: true, costPrice: true, shippingCost: true, otherCost: true },
    });
    let changed = 0;
    let skippedNoCost = 0;
    let skippedAboveMrp = 0;
    const log: { sku: string; from: number; to: number }[] = [];
    for (const p of products) {
      const v = repriceVerdict(p, rule);
      if (v.kind === "no-cost") { skippedNoCost++; continue; }
      if (v.kind === "above-mrp") { skippedAboveMrp++; continue; }
      if (v.kind !== "change") continue;
      // Conditional on the old price, so a product edited at the same moment is not overwritten.
      const res = await db.product.updateMany({ where: { id: p.id, price: v.from }, data: { price: v.to } });
      if (res.count === 1) { changed++; log.push({ sku: p.sku, from: v.from, to: v.to }); }
    }
    await audit({ actor, action: "products.reprice_membership", entityType: "Product", newValue: { regularProfit: rule.regularProfit, changed, skippedNoCost, skippedAboveMrp, changes: log.slice(0, 500) } });
    revalidatePath("/", "layout");
    return { changed, skippedNoCost, skippedAboveMrp };
  }, "Prices updated");
}
