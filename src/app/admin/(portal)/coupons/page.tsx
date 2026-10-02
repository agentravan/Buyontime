import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/admin/ui";
import { CouponManager } from "@/components/admin/coupon-manager";
import { requireStaffPage } from "@/server/admin-guard";

export const metadata: Metadata = { title: "Coupons" };

export default async function CouponsPage() {
  await requireStaffPage("coupons:manage");
  // Personal Spin & Win coupons are issued automatically (one per customer) and are kept out of this list.
  const [coupons, spinIssued, spinUsed, vouchersPending] = await Promise.all([
    db.coupon.findMany({ where: { userId: null }, orderBy: { createdAt: "desc" } }),
    db.coupon.count({ where: { source: "spin" } }),
    db.coupon.count({ where: { source: "spin", usedCount: { gt: 0 } } }),
    db.spinResult.findMany({ where: { prize: "GIFT_VOUCHER", voucherCode: null }, orderBy: { createdAt: "asc" }, include: { user: { select: { id: true, name: true, email: true } } }, take: 50 }),
  ]);
  return (
    <div>
      <PageHeader title="Coupons" description="Customers apply coupon codes at checkout. Usage is counted atomically and released if an order is cancelled." />
      <p className="mb-3 rounded-xl bg-brand-50 px-3 py-2 text-sm text-brand-900">Spin &amp; Win has issued <b>{spinIssued}</b> personal coupon(s); <b>{spinUsed}</b> used so far. Chances and limits are under Settings → Spin &amp; Win.</p>
      {vouchersPending.length > 0 && (
        <div className="mb-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <p className="font-bold">{vouchersPending.length} gift voucher(s) waiting for a code</p>
          <ul className="mt-1 space-y-0.5">
            {vouchersPending.map((v) => (
              <li key={v.id}>
                <Link href={`/admin/customers/${v.user.id}`} className="font-semibold underline">{v.user.name}</Link> ({v.user.email}) — ₹{Math.round((v.voucherAmount ?? 0) / 100)} {v.granted ? "· given by you" : "· won on the wheel"}
              </li>
            ))}
          </ul>
        </div>
      )}
      <CouponManager coupons={coupons.map((c) => ({
        id: c.id, code: c.code, description: c.description ?? "", type: c.type, value: c.value, minOrder: c.minOrder, maxDiscount: c.maxDiscount,
        expiresAt: c.expiresAt ? c.expiresAt.toISOString() : null, usageLimit: c.usageLimit, perUserLimit: c.perUserLimit, usedCount: c.usedCount, isActive: c.isActive,
      }))} />
    </div>
  );
}
