"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit, diff } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { AppError, safeAction, type ActionResult } from "@/lib/errors";
import { adapterFor } from "@/lib/notifications/adapters";
import { rateLimit } from "@/lib/rate-limit";
import { isAllowedImageUrl } from "@/lib/storage";
import { rupees } from "@/lib/validation";

const pincodes = z.string().optional().transform((v) =>
  (v ?? "").split(/[\s,]+/).map((p) => p.trim()).filter((p) => /^[1-9]\d{5}$/.test(p)),
);

const settingsSchema = z.object({
  storeName: z.string().trim().min(2).max(60),
  tagline: z.string().trim().max(120).optional(),
  logoUrl: z.string().trim().max(500).optional().refine((v) => !v || isAllowedImageUrl(v), "Upload the logo with the uploader"),
  contactEmail: z.string().trim().email(),
  contactPhone: z.string().trim().max(20),
  storeAddress: z.string().trim().max(300),
  legalName: z.string().trim().max(120).optional(),
  gstin: z.string().trim().toUpperCase().refine((v) => !v || /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(v), "Enter a valid 15-character GSTIN").optional(),
  grievanceOfficerName: z.string().trim().max(80).optional(),
  grievanceOfficerEmail: z.string().trim().max(120).optional().refine((v) => !v || z.string().email().safeParse(v).success, "Invalid email"),
  onlinePaymentEnabled: z.boolean(),
  codEnabled: z.boolean(),
  codFee: rupees,
  codMaxOrderValue: rupees.nullable(),
  codMinOrderValue: rupees,
  codBlockedPincodes: pincodes,
  codMarkPaidOnDelivery: z.boolean(),
  mixedCartPolicy: z.enum(["SPLIT_ORDERS", "BLOCK"]),
  paymentWindowMinutes: z.coerce.number().int().min(10).max(1440),
  inventoryPolicy: z.enum(["RESERVE_AT_CHECKOUT", "DEDUCT_ON_PAYMENT"]),
  defaultLowStockThreshold: z.coerce.number().int().min(0).max(10000),
  freeShippingThreshold: rupees,
  standardShippingFee: rupees,
  estimatedDeliveryDays: z.coerce.number().int().min(1).max(30),
  unserviceablePincodes: pincodes,
  returnWindowDays: z.coerce.number().int().min(0).max(90),
  gstMode: z.enum(["NOT_REGISTERED", "REGISTERED"]),
  claimInputTaxCredit: z.boolean(),
  gatewayFeeBps: z.coerce.number().min(0).max(10).transform((v) => Math.round(v * 100)),
  packagingCostPerOrder: rupees,
  codCollectionCharge: rupees,
  codRtoRatePct: z.coerce.number().int().min(0).max(100),
  vipLifetimeSpend: rupees,
  loginLook: z.enum(["teal", "gold"]).default("teal"),
  orderAlertEmail: z.string().trim().max(500).optional().refine(
    (v) => !v || v.split(/[\s,;]+/).filter(Boolean).every((e) => z.string().email().safeParse(e).success),
    "Enter one or more valid email addresses, separated by commas",
  ),
  spinEnabled: z.boolean(),
  spinsPerOrder: z.coerce.number().int().min(0).max(20),
  spinWeight10: z.coerce.number().int().min(0).max(1000),
  spinWeight20: z.coerce.number().int().min(0).max(1000),
  spinWeight30: z.coerce.number().int().min(0).max(1000),
  spinWeightFreeDelivery: z.coerce.number().int().min(0).max(1000),
  spinMinOrder: rupees,
  spinMaxDiscount: rupees,
  spinCouponValidDays: z.coerce.number().int().min(1).max(90),
  spinVoucherEveryOrders: z.coerce.number().int().min(0).max(100),
  giftVoucherAmount: rupees,
  referralEnabled: z.boolean(),
  referralRewardMin: rupees,
  referralRewardMax: rupees,
  referralMilestoneBonus: rupees,
  referralCouponMinOrder: rupees,
  referralCouponValidDays: z.coerce.number().int().min(1).max(365),
  emailNotifications: z.boolean(),
  smsNotifications: z.boolean(),
  whatsappNotifications: z.boolean(),
});

/** Sends a test email to the signed-in admin's own address and reports exactly what the mail server said. */
export async function sendTestEmailAction(): Promise<ActionResult<{ to: string; provider: string }>> {
  return safeAction(async () => {
    const actor = await requirePermission("settings:manage");
    await rateLimit(`test-email:${actor.id}`, 5, 600);
    const adapter = adapterFor("EMAIL");
    if (!adapter.configured()) throw new AppError("Email is not configured. Add the SMTP_* (or RESEND_API_KEY) environment variables in Vercel and redeploy.");
    const res = await adapter.send({
      to: actor.email,
      subject: "Buyontime test email",
      text: "This is a test email from your store. If you can read it, customer emails (password reset, order updates) are working.",
    });
    if (!res.ok) throw new AppError(`The mail server refused: ${res.error}`);
    return { to: actor.email, provider: adapter.provider };
  });
}

export async function saveSettingsAction(input: unknown): Promise<ActionResult<null>> {
  return safeAction(async () => {
    const actor = await requirePermission("settings:manage");
    const d = settingsSchema.parse(input);
    const data = {
      ...d,
      tagline: d.tagline || null, logoUrl: d.logoUrl || null, legalName: d.legalName || null, gstin: d.gstin || null,
      grievanceOfficerName: d.grievanceOfficerName || null, grievanceOfficerEmail: d.grievanceOfficerEmail || null,
      orderAlertEmail: d.orderAlertEmail ? d.orderAlertEmail.split(/[\s,;]+/).filter(Boolean).join(", ").toLowerCase() : null,
    };
    const before = await db.storeSettings.upsert({ where: { id: "store" }, update: {}, create: { id: "store" } });
    await db.storeSettings.update({ where: { id: "store" }, data });
    const change = diff(before as unknown as Record<string, unknown>, data as unknown as Record<string, unknown>);
    if (change.changed) await audit({ actor, action: "settings.update", entityType: "StoreSettings", entityId: "store", oldValue: change.oldValue, newValue: change.newValue });
    revalidatePath("/", "layout");
    return null;
  }, "Settings saved");
}
