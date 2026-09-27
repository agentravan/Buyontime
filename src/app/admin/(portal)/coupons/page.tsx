import type { Metadata } from "next";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/admin/ui";
import { CouponManager } from "@/components/admin/coupon-manager";
import { requireStaffPage } from "@/server/admin-guard";

export const metadata: Metadata = { title: "Coupons" };

export default async function CouponsPage() {
  await requireStaffPage("coupons:manage");
  const coupons = await db.coupon.findMany({ orderBy: { createdAt: "desc" } });
  return (
    <div>
      <PageHeader title="Coupons" description="Customers apply coupon codes at checkout. Usage is counted atomically and released if an order is cancelled." />
      <CouponManager coupons={coupons.map((c) => ({
        id: c.id, code: c.code, description: c.description ?? "", type: c.type, value: c.value, minOrder: c.minOrder, maxDiscount: c.maxDiscount,
        expiresAt: c.expiresAt ? c.expiresAt.toISOString() : null, usageLimit: c.usageLimit, perUserLimit: c.perUserLimit, usedCount: c.usedCount, isActive: c.isActive,
      }))} />
    </div>
  );
}
