import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { formatINR } from "@/lib/money";
import { PLAN_LABEL, landedCost, memberRule, memberUnitPrice, repriceVerdict } from "@/lib/membership";
import { getSettings } from "@/lib/settings";
import { formatDate } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { PageHeader, Table } from "@/components/admin/ui";
import { ApplyPricingButton, CancelMembershipButton, SendRewardForm, SyncRewardsButton } from "@/components/admin/membership-controls";
import { requireStaffPage } from "@/server/admin-guard";
import { adminMembershipData } from "@/server/membership";

export const metadata: Metadata = { title: "BuyOnTime Plus" };

export default async function MembershipAdminPage() {
  await requireStaffPage("customers:view");
  const settings = await getSettings();
  const rule = memberRule(settings);
  const [data, products] = await Promise.all([
    adminMembershipData(),
    db.product.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, sku: true, status: true, price: true, mrp: true, costPrice: true, shippingCost: true, otherCost: true },
    }),
  ]);

  const rows = products.map((p) => ({ p, v: repriceVerdict(p, rule), member: memberUnitPrice(p.price, p, rule) }));
  const changes = rows.filter((r) => r.v.kind === "change");
  const noCost = rows.filter((r) => r.v.kind === "no-cost");
  const aboveMrp = rows.filter((r) => r.v.kind === "above-mrp");
  const gap = settings.regularProfit - settings.memberProfit;

  return (
    <div className="space-y-6">
      <PageHeader
        title="BuyOnTime Plus"
        description={`Paid membership: ${formatINR(settings.membershipPriceHalfYear)} for 6 months, ${formatINR(settings.membershipPriceYear)} for 12 months. Change prices, profits and rewards under Settings → BuyOnTime Plus.`}
        actions={<Link href="/membership" className="rounded-xl border border-line px-4 py-2 text-sm font-semibold hover:bg-slate-50">View customer page</Link>}
      />

      {!settings.membershipEnabled && <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">Membership is switched off. Turn it on under Settings → BuyOnTime Plus.</p>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { t: "Active members", v: String(data.activeCount) },
          { t: "Membership income", v: formatINR(data.revenue), s: `${data.paidCount} paid membership(s)` },
          { t: "Vouchers waiting", v: String(data.pending.length) },
          { t: "Vouchers sent", v: formatINR(data.vouchersSentValue), s: `${data.vouchersSent} voucher(s)` },
        ].map((x) => (
          <Card key={x.t} className="p-4">
            <p className="text-xs font-semibold text-muted">{x.t}</p>
            <p className="mt-1 text-2xl font-extrabold">{x.v}</p>
            {x.s && <p className="text-xs text-muted">{x.s}</p>}
          </Card>
        ))}
      </div>

      <Card className="space-y-3 p-5">
        <h2 className="text-lg font-bold">Pricing formula</h2>
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          <p className="rounded-xl bg-slate-50 p-3"><b>Regular price</b> = cost + shipping + other cost + <b>{formatINR(settings.regularProfit)}</b></p>
          <p className="rounded-xl bg-slate-50 p-3"><b>Member price</b> = cost + shipping + other cost + <b>{formatINR(settings.memberProfit)}</b> (members save {formatINR(gap)} per item)</p>
        </div>
        <p className="text-xs text-muted">
          Member prices are worked out live from each product&apos;s cost, so they are always right. Regular prices are the ones saved on each product; the button
          below sets them to the formula. A product with no cost entered gets no member price — fill in its cost on the product page first.
          Prices are never set above MRP. &quot;Profit&quot; here is price minus the costs you entered; Razorpay fees, COD returns and GST are not included.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <ApplyPricingButton changes={changes.length} regularProfit={formatINR(settings.regularProfit)} />
          <span className="text-sm text-muted">{changes.length} to change · {noCost.length} without a cost · {aboveMrp.length} would go above MRP (left as is)</span>
        </div>
        <Table>
          <thead>
            <tr><th>Product</th><th>Total cost</th><th>Regular now</th><th>Formula price</th><th>Member price</th><th>Status</th></tr>
          </thead>
          <tbody>
            {[...changes, ...aboveMrp, ...noCost].slice(0, 200).map(({ p, v, member }) => (
              <tr key={p.id}>
                <td><Link href={`/admin/products/${p.id}`} className="font-semibold hover:underline">{p.name}</Link><span className="block text-xs text-muted">{p.sku}{p.status !== "ACTIVE" ? ` · ${p.status.toLowerCase()}` : ""}</span></td>
                <td>{p.costPrice > 0 ? formatINR(landedCost(p)) : "—"}</td>
                <td>{formatINR(p.price)}</td>
                <td>{v.kind === "change" || v.kind === "above-mrp" ? formatINR(v.kind === "change" ? v.to : v.price) : "—"}</td>
                <td>{member !== null ? formatINR(member) : "—"}</td>
                <td className="text-xs">
                  {v.kind === "change" ? <span className="font-semibold text-brand-700">Will change</span>
                    : v.kind === "above-mrp" ? <span className="font-semibold text-amber-700">Above MRP {formatINR(v.mrp)}</span>
                      : <span className="font-semibold text-red-600">Enter cost</span>}
                </td>
              </tr>
            ))}
            {changes.length + aboveMrp.length + noCost.length === 0 && <tr><td colSpan={6} className="text-center text-muted">All products already follow the formula.</td></tr>}
          </tbody>
        </Table>
      </Card>

      <Card className="space-y-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold">Gift vouchers to send</h2>
          <SyncRewardsButton />
        </div>
        <p className="text-xs text-muted">
          A member earns one voucher ({formatINR(settings.memberRewardMin)}–{formatINR(settings.memberRewardMax)}) for every {settings.memberRewardEveryOrders} delivered orders placed while they are a member.
          Buy the voucher, paste its code here and the customer sees it on their BuyOnTime Plus page. Check the orders were not returned before sending.
        </p>
        {data.pending.length === 0 ? (
          <p className="text-sm text-muted">No vouchers waiting.</p>
        ) : (
          <ul className="divide-y divide-line">
            {data.pending.map((r) => (
              <li key={r.id} className="space-y-2 py-3">
                <p className="text-sm">
                  <b>{formatINR(r.amount)}</b> for <Link href={`/admin/customers/${r.user.id}`} className="font-semibold underline">{r.user.name}</Link>
                  <span className="text-muted"> · {r.user.email}{r.user.phone ? ` · ${r.user.phone}` : ""} · {r.milestone} delivered orders · earned {formatDate(r.createdAt)}</span>
                </p>
                <SendRewardForm rewardId={r.id} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="space-y-3 p-5">
        <h2 className="text-lg font-bold">Recent memberships</h2>
        <Table>
          <thead>
            <tr><th>Customer</th><th>Plan</th><th>Paid</th><th>Valid</th><th>Orders</th><th>Status</th><th /></tr>
          </thead>
          <tbody>
            {data.recentMembers.map((m) => (
              <tr key={m.id}>
                <td><Link href={`/admin/customers/${m.user.id}`} className="font-semibold hover:underline">{m.user.name}</Link><span className="block text-xs text-muted">{m.user.email}</span></td>
                <td>{PLAN_LABEL[m.plan]}</td>
                <td>{formatINR(m.amount)}<span className="block text-xs text-muted">{m.paidAt ? formatDate(m.paidAt) : ""}</span></td>
                <td className="text-xs">{m.startsAt ? formatDate(m.startsAt) : ""} – {m.endsAt ? formatDate(m.endsAt) : ""}</td>
                <td>{m._count.orders}</td>
                <td className="text-xs font-semibold">{m.status === "CANCELLED" ? "Cancelled" : m.endsAt && m.endsAt < new Date() ? "Expired" : "Active"}</td>
                <td>{m.status === "ACTIVE" && m.endsAt && m.endsAt > new Date() && <CancelMembershipButton membershipId={m.id} />}</td>
              </tr>
            ))}
            {data.recentMembers.length === 0 && <tr><td colSpan={7} className="text-center text-muted">No members yet.</td></tr>}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
