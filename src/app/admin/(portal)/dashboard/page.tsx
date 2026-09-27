import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Banknote, Boxes, CircleDollarSign, CreditCard, IndianRupee, PackageCheck, RotateCcw, ShoppingBag, TrendingUp, Truck, Users } from "lucide-react";
import { formatINR } from "@/lib/money";
import { can } from "@/lib/permissions";
import { getSettings } from "@/lib/settings";
import { formatDate } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, StatCard } from "@/components/ui/card";
import { DailyBarChart } from "@/components/admin/charts";
import { requireStaffPage } from "@/server/admin-guard";
import { dashboardData } from "@/server/dashboard";
import { expireStaleOrders } from "@/server/orders";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await requireStaffPage("dashboard:view");
  const finance = can(user.role, "finance:view");
  const settings = await getSettings();
  // Opportunistic cleanup of unpaid online orders (also runs via Vercel Cron).
  await expireStaleOrders(10).catch((e) => console.error("[dashboard] expiry", e));
  const d = await dashboardData(settings, finance);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted">Payment, order and inventory status update automatically from Razorpay and store activity.</p>
      </div>

      {(d.attention.length > 0 || d.mismatches > 0) && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="space-y-2">
            <p className="flex items-center gap-2 font-bold text-amber-900"><AlertTriangle className="size-4" /> Needs your attention</p>
            {d.mismatches > 0 && finance && (
              <Link href="/admin/payments?filter=mismatch" className="block text-sm font-semibold text-amber-900 underline">⚠ PAYMENT RECONCILIATION REQUIRED — {d.mismatches} payment(s)</Link>
            )}
            {d.attention.map((o) => (
              <Link key={o.id} href={`/admin/orders/${o.id}`} className="block text-sm text-amber-900 hover:underline"><b>{o.orderNumber}</b> — {o.needsAttention}</Link>
            ))}
          </CardContent>
        </Card>
      )}

      {finance && (
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Revenue today" value={formatINR(d.revenue.today)} hint={`${d.revenue.todayOrders} orders`} icon={<IndianRupee />} tone="green" />
          <StatCard label="Last 7 days" value={formatINR(d.revenue.week)} hint={`${d.revenue.weekOrders} orders`} icon={<TrendingUp />} tone="green" />
          <StatCard label="This month" value={formatINR(d.revenue.month)} hint={`${d.revenue.monthOrders} orders`} icon={<CircleDollarSign />} tone="green" />
          <StatCard label="Est. profit (month)" value={formatINR(d.profit.profit)} hint={`${d.profit.margin}% margin · costs ${formatINR(d.profit.costs)}`} icon={<TrendingUp />} tone={d.profit.profit >= 0 ? "blue" : "red"} />
        </section>
      )}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="New (to pack)" value={d.orders.new} icon={<ShoppingBag />} tone="blue" />
        <StatCard label="Processing" value={d.orders.processing} icon={<PackageCheck />} tone="purple" />
        <StatCard label="Shipped" value={d.orders.shipped} icon={<Truck />} tone="purple" />
        <StatCard label="Delivered" value={d.orders.delivered} icon={<PackageCheck />} tone="green" />
        <StatCard label="Cancelled" value={d.orders.cancelled} tone="red" />
        <StatCard label="Returned / RTO" value={d.orders.returned} icon={<RotateCcw />} tone="orange" />
      </section>

      {finance && (
        <section className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Revenue — last 30 days</CardTitle></CardHeader>
            <CardContent><DailyBarChart data={d.chart} metric="revenue" label="Daily revenue for the last 30 days" /></CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Orders — last 30 days</CardTitle></CardHeader>
            <CardContent><DailyBarChart data={d.chart} metric="orders" label="Daily orders for the last 30 days" /></CardContent>
          </Card>
        </section>
      )}

      <section className="grid gap-4 lg:grid-cols-3">
        {finance && (
          <Card>
            <CardHeader><CardTitle>Payments</CardTitle><Link href="/admin/payments" className="text-xs font-semibold text-brand-700">Reconcile</Link></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {[
                ["🟢", "Payment received", d.payments.paid],
                ["🟡", "Payment pending", d.payments.pending],
                ["🔴", "Payment failed", d.payments.failed],
                ["🔵", "Refunded", d.payments.refunded],
              ].map(([icon, label, n]) => (
                <div key={String(label)} className="flex items-center justify-between"><span>{icon} {label}</span><b>{n}</b></div>
              ))}
              <div className="flex items-center justify-between border-t border-line pt-2"><span className="flex items-center gap-1.5"><Banknote className="size-4 text-orange-600" /> COD orders</span><b>{d.methods.cod}</b></div>
              <div className="flex items-center justify-between"><span className="flex items-center gap-1.5"><CreditCard className="size-4 text-sky-600" /> Online orders</span><b>{d.methods.online}</b></div>
              <div className="flex items-center justify-between"><span>Awaiting online payment</span><b>{d.orders.awaitingPayment}</b></div>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader><CardTitle>Customers & inventory</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {finance && <>
              <div className="flex justify-between"><span className="flex items-center gap-1.5"><Users className="size-4 text-muted" /> Total customers</span><b>{d.customers.total}</b></div>
              <div className="flex justify-between"><span>New (30 days)</span><b>{d.customers.new30}</b></div>
              <div className="flex justify-between"><span>Returning</span><b>{d.customers.returning}</b></div>
              <div className="flex justify-between"><span>VIP (≥ {formatINR(settings.vipLifetimeSpend)} spent)</span><b>{d.customers.vip}</b></div>
            </>}
            <div className="flex justify-between border-t border-line pt-2"><span className="flex items-center gap-1.5"><Boxes className="size-4 text-muted" /> Products</span><b>{d.inventory.products}</b></div>
            <Link href="/admin/inventory?filter=low" className="flex justify-between text-saffron-600 hover:underline"><span>Low stock variants</span><b>{d.inventory.low}</b></Link>
            <Link href="/admin/inventory?filter=out" className="flex justify-between text-red-600 hover:underline"><span>Out of stock variants</span><b>{d.inventory.out}</b></Link>
            {finance && <>
              <div className="flex justify-between border-t border-line pt-2"><span>Returns to process</span><b>{d.returns.pending}</b></div>
              <div className="flex justify-between"><span>Refunded this month</span><b>{formatINR(d.returns.refundedMonth)}</b></div>
            </>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Recent activity</CardTitle></CardHeader>
          <CardContent className="p-0">
            <ul className="max-h-80 divide-y divide-line overflow-y-auto">
              {d.activity.length === 0 && <li className="p-4 text-sm text-muted">No activity yet.</li>}
              {d.activity.map((e) => (
                <li key={e.id} className="px-4 py-2.5 text-sm">
                  <Link href={`/admin/orders/${e.order.id}`} className="font-semibold hover:text-brand-700">{e.order.orderNumber}</Link>
                  <p className="line-clamp-2 text-xs text-slate-600">{e.message}</p>
                  <p className="text-[11px] text-muted">{formatDate(e.createdAt, true)}</p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
