import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { formatINR } from "@/lib/money";
import { RETURN_STATUS_LABEL } from "@/lib/order-status";
import { can } from "@/lib/permissions";
import { getSettings } from "@/lib/settings";
import { formatDate } from "@/lib/utils";
import { Badge, Card, CardContent, CardHeader, CardTitle, StatCard } from "@/components/ui/card";
import { MethodBadge, OrderStatusBadge, PaymentStatusBadge } from "@/components/status";
import { CreatorRewardCard, CustomerControls, CustomerNotes } from "@/components/admin/customer-controls";
import { requireStaffPage } from "@/server/admin-guard";

export const metadata: Metadata = { title: "Customer 360°" };

const SUCCESS = ["DELIVERED"];
const BOOKED_EXCL = ["PENDING_PAYMENT", "CANCELLED", "RTO"];

/** Customer 360°: everything support needs before replying, on one screen. No passwords or payment secrets. */
export default async function Customer360({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaffPage("customers:view");
  const { id } = await params;
  const customer = await db.user.findUnique({
    where: { id },
    select: {
      id: true, name: true, email: true, phone: true, role: true, status: true, codBlocked: true, createdAt: true, lastLoginAt: true,
      creatorRewardEligible: true,
      spin: { include: { coupon: { select: { code: true, usedCount: true } } } },
      dateOfBirth: true, gender: true, emailOptIn: true, smsOptIn: true, whatsappOptIn: true,
      addresses: { orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }] },
    },
  });
  if (!customer || customer.role !== "CUSTOMER") notFound();
  const settings = await getSettings();

  const [orders, payments, refunds, returns, notes, wishlist, cart, views, deliveries, inApp] = await Promise.all([
    db.order.findMany({ where: { userId: id }, orderBy: { createdAt: "desc" }, include: { items: { include: { product: { select: { category: { select: { name: true } } } } } }, shipment: true } }),
    db.payment.findMany({ where: { userId: id }, orderBy: { createdAt: "desc" }, include: { order: { select: { id: true, orderNumber: true } } } }),
    db.refund.findMany({ where: { order: { userId: id } }, orderBy: { createdAt: "desc" }, include: { order: { select: { id: true, orderNumber: true } } } }),
    db.returnRequest.findMany({ where: { userId: id }, orderBy: { createdAt: "desc" }, include: { order: { select: { id: true, orderNumber: true } } } }),
    db.customerNote.findMany({ where: { customerId: id }, orderBy: { createdAt: "desc" }, include: { author: { select: { name: true, role: true } } } }),
    db.wishlistItem.findMany({ where: { userId: id }, include: { product: { select: { name: true, slug: true } } }, take: 20 }),
    db.cart.findUnique({ where: { userId: id }, include: { items: { include: { variant: { include: { product: { select: { name: true } } } } } } } }),
    db.productView.findMany({ where: { userId: id }, orderBy: { viewedAt: "desc" }, take: 10, include: { product: { select: { name: true, slug: true } } } }),
    db.notificationDelivery.findMany({ where: { userId: id }, orderBy: { createdAt: "desc" }, take: 20 }),
    db.notification.findMany({ where: { userId: id, audience: "CUSTOMER" }, orderBy: { createdAt: "desc" }, take: 10 }),
  ]);

  const booked = orders.filter((o) => !BOOKED_EXCL.includes(o.status));
  const lifetime = booked.reduce((s, o) => s + o.total, 0) - refunds.filter((r) => r.status === "PROCESSED").reduce((s, r) => s + r.amount, 0);
  const aov = booked.length ? Math.round(booked.reduce((s, o) => s + o.total, 0) / booked.length) : 0;
  const paidTotal = payments.filter((p) => ["PAID", "PARTIALLY_REFUNDED", "REFUND_PENDING", "REFUNDED"].includes(p.status)).reduce((s, p) => s + p.amount, 0);
  const pendingPay = payments.filter((p) => ["PENDING", "AUTHORIZED"].includes(p.status));
  const failedPay = payments.filter((p) => p.status === "FAILED");
  const refundedTotal = refunds.filter((r) => r.status === "PROCESSED").reduce((s, r) => s + r.amount, 0);

  const productCounts = new Map<string, number>();
  const categoryCounts = new Map<string, number>();
  for (const o of booked) for (const i of o.items) {
    productCounts.set(i.name, (productCounts.get(i.name) ?? 0) + i.quantity);
    const c = i.product.category?.name;
    if (c) categoryCounts.set(c, (categoryCounts.get(c) ?? 0) + i.quantity);
  }
  const topProducts = [...productCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const topCategories = [...categoryCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const current = orders.filter((o) => ["PENDING_PAYMENT", "CONFIRMED", "PROCESSING", "SHIPPED", "OUT_FOR_DELIVERY", "RETURN_REQUESTED"].includes(o.status));
  const vip = lifetime >= settings.vipLifetimeSpend;
  const count = (s: string[]) => orders.filter((o) => s.includes(o.status)).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/admin/customers" className="text-sm font-semibold text-brand-700 hover:underline">← Customers</Link>
          <h1 className="mt-1 flex flex-wrap items-center gap-2 text-2xl font-extrabold tracking-tight">{customer.name} {vip && <Badge tone="purple">VIP</Badge>}</h1>
          <p className="text-sm text-muted">{customer.email} · {customer.phone ?? "no phone"}</p>
          <p className="text-xs text-muted">Account created {formatDate(customer.createdAt)}{customer.lastLoginAt ? ` · last login ${formatDate(customer.lastLoginAt, true)}` : ""}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge tone={customer.status === "ACTIVE" ? "green" : "red"}>{customer.status === "ACTIVE" ? "Active" : "Blocked"}</Badge>
          {customer.codBlocked && <Badge tone="orange">COD blocked</Badge>}
        </div>
      </div>
      {can(staff.role, "customers:manage") && <CustomerControls userId={customer.id} status={customer.status} codBlocked={customer.codBlocked} />}
      <CreatorRewardCard
        userId={customer.id}
        eligible={customer.creatorRewardEligible}
        canManage={can(staff.role, "customers:manage")}
        voucherAmount={settings.creatorVoucherAmount}
        spin={customer.spin ? {
          prize: customer.spin.prize, couponCode: customer.spin.coupon?.code ?? null, couponUsed: (customer.spin.coupon?.usedCount ?? 0) > 0,
          voucherAmount: customer.spin.voucherAmount, voucherCode: customer.spin.voucherCode, revealed: Boolean(customer.spin.revealedAt),
          createdAt: customer.spin.createdAt.toISOString(),
        } : null}
      />

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <StatCard label="Lifetime value" value={formatINR(lifetime)} tone="green" />
        <StatCard label="Avg order value" value={formatINR(aov)} />
        <StatCard label="Total orders" value={orders.length} hint={`${count(SUCCESS)} delivered`} />
        <StatCard label="Cancelled" value={count(["CANCELLED"])} tone="red" />
        <StatCard label="Returned / RTO" value={count(["RETURNED", "RETURN_REQUESTED", "RTO"])} tone="orange" />
        <StatCard label="COD / Online" value={`${orders.filter((o) => o.paymentMethod === "COD").length} / ${orders.filter((o) => o.paymentMethod === "ONLINE").length}`} />
      </section>

      {current.length > 0 && (
        <Card className="border-brand-200">
          <CardHeader><CardTitle>Current orders</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {current.map((o) => (
              <Link key={o.id} href={`/admin/orders/${o.id}`} className="flex flex-wrap items-center gap-2 rounded-xl border border-line p-2.5 text-sm hover:bg-slate-50">
                <b>{o.orderNumber}</b><OrderStatusBadge status={o.status} /><PaymentStatusBadge status={o.paymentStatus} withIcon />
                <span className="text-xs text-muted">{o.shipment?.courier ? `${o.shipment.courier} ${o.shipment.trackingId ?? ""}` : "not shipped yet"}</span>
                <span className="ml-auto font-semibold">{formatINR(o.total)}</span>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Card>
            <CardHeader><CardTitle>Order history</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full min-w-[620px] text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-muted"><tr><th className="px-4 py-2">Order</th><th className="px-2">Date</th><th className="px-2">Items</th><th className="px-2">Method</th><th className="px-2">Payment</th><th className="px-2">Status</th><th className="px-4 text-right">Total</th></tr></thead>
                <tbody>
                  {orders.length === 0 && <tr><td colSpan={7} className="px-4 py-6 text-center text-muted">No orders.</td></tr>}
                  {orders.map((o) => (
                    <tr key={o.id} className="border-t border-line">
                      <td className="px-4 py-2"><Link href={`/admin/orders/${o.id}`} className="font-semibold text-brand-700 hover:underline">{o.orderNumber}</Link></td>
                      <td className="px-2 text-xs">{formatDate(o.createdAt)}</td>
                      <td className="px-2 text-xs">{o.items.reduce((s, i) => s + i.quantity, 0)}</td>
                      <td className="px-2"><MethodBadge method={o.paymentMethod} /></td>
                      <td className="px-2"><PaymentStatusBadge status={o.paymentStatus} withIcon /></td>
                      <td className="px-2"><OrderStatusBadge status={o.status} /></td>
                      <td className="px-4 text-right font-semibold">{formatINR(o.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Payment history</CardTitle></CardHeader>
            <CardContent>
              <div className="mb-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                <div className="rounded-xl bg-emerald-50 p-2.5"><p className="text-xs text-emerald-800">Total paid</p><p className="font-bold">{formatINR(paidTotal)}</p></div>
                <div className="rounded-xl bg-amber-50 p-2.5"><p className="text-xs text-amber-800">Pending</p><p className="font-bold">{pendingPay.length} · {formatINR(pendingPay.reduce((s, p) => s + p.amount, 0))}</p></div>
                <div className="rounded-xl bg-red-50 p-2.5"><p className="text-xs text-red-800">Failed attempts</p><p className="font-bold">{failedPay.length}</p></div>
                <div className="rounded-xl bg-sky-50 p-2.5"><p className="text-xs text-sky-800">Refunded</p><p className="font-bold">{formatINR(refundedTotal)}</p></div>
              </div>
              <ul className="divide-y divide-line text-sm">
                {payments.slice(0, 12).map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-2 py-2">
                    <Link href={`/admin/orders/${p.order.id}`} className="font-semibold hover:text-brand-700">{p.order.orderNumber}</Link>
                    <MethodBadge method={p.method} /><PaymentStatusBadge status={p.status} withIcon />
                    {p.failureReason && p.status === "FAILED" && <span className="text-xs text-red-600">{p.failureReason}</span>}
                    <span className="ml-auto text-xs text-muted">{formatDate(p.createdAt, true)}</span>
                    <span className="font-semibold">{formatINR(p.amount)}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Support history</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <CustomerNotes userId={customer.id} canWrite={can(staff.role, "customers:manage")} notes={notes.map((n) => ({ id: n.id, body: n.body, type: n.type, status: n.status, author: n.author.name, byCustomer: n.author.role === "CUSTOMER", createdAt: n.createdAt.toISOString() }))} />
              <div>
                <p className="mb-1 text-sm font-bold">Returns</p>
                {returns.length === 0 ? <p className="text-sm text-muted">No returns.</p> : returns.map((r) => (
                  <div key={r.id} className="flex flex-wrap justify-between gap-2 border-t border-line py-2 text-sm">
                    <span><Link href={`/admin/orders/${r.order.id}`} className="font-semibold">{r.order.orderNumber}</Link> · {r.reason}</span>
                    <Badge tone="orange">{RETURN_STATUS_LABEL[r.status]}</Badge>
                  </div>
                ))}
              </div>
              <div>
                <p className="mb-1 text-sm font-bold">Refunds</p>
                {refunds.length === 0 ? <p className="text-sm text-muted">No refunds.</p> : refunds.map((r) => (
                  <div key={r.id} className="flex flex-wrap justify-between gap-2 border-t border-line py-2 text-sm">
                    <span><Link href={`/admin/orders/${r.order.id}`} className="font-semibold">{r.order.orderNumber}</Link> · {r.reason}</span>
                    <span>{formatINR(r.amount)} <Badge tone={r.status === "PROCESSED" ? "blue" : r.status === "FAILED" ? "red" : "purple"}>{r.status.toLowerCase()}</Badge></span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Addresses</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              {customer.addresses.length === 0 && <p className="text-muted">No saved addresses.</p>}
              {customer.addresses.map((a) => (
                <div key={a.id}>
                  <p className="font-semibold">{a.name} {a.isDefault && <Badge tone="blue">Default</Badge>}</p>
                  <p className="text-muted">{[a.line1, a.line2, a.landmark].filter(Boolean).join(", ")}, {a.city}, {a.state} {a.pincode}</p>
                  <p className="text-xs text-muted">{a.phone}</p>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Shopping behaviour</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p><span className="text-muted">Last order:</span> {orders[0] ? formatDate(orders[0].createdAt) : "—"}</p>
              <div><p className="font-semibold">Frequently purchased categories</p>{topCategories.length ? <div className="mt-1 flex flex-wrap gap-1">{topCategories.map(([c, n]) => <Badge key={c}>{c} · {n}</Badge>)}</div> : <p className="text-muted">—</p>}</div>
              <div><p className="font-semibold">Products purchased</p>{topProducts.length ? <ul className="mt-1 space-y-0.5 text-xs">{topProducts.map(([p, n]) => <li key={p}>{p} × {n}</li>)}</ul> : <p className="text-muted">—</p>}</div>
              <div><p className="font-semibold">Wishlist ({wishlist.length})</p><ul className="mt-1 space-y-0.5 text-xs">{wishlist.slice(0, 6).map((w) => <li key={w.id}><Link href={`/products/${w.product.slug}`} className="hover:text-brand-700">{w.product.name}</Link></li>)}</ul></div>
              <div><p className="font-semibold">In cart now ({cart?.items.length ?? 0})</p><ul className="mt-1 space-y-0.5 text-xs">{cart?.items.map((i) => <li key={i.id}>{i.variant.product.name} × {i.quantity}</li>)}</ul>{cart && cart.items.length > 0 && <p className="text-[11px] text-muted">Updated {formatDate(cart.updatedAt, true)}</p>}</div>
              <div><p className="font-semibold">Recently viewed</p><ul className="mt-1 space-y-0.5 text-xs">{views.map((v) => <li key={v.id}>{v.product.name} <span className="text-muted">({v.viewCount}×)</span></li>)}</ul></div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Communication</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-xs">
              <p className="text-sm">Preferences: Email {customer.emailOptIn ? "✓" : "✗"} · SMS {customer.smsOptIn ? "✓" : "✗"} · WhatsApp {customer.whatsappOptIn ? "✓" : "✗"}</p>
              {deliveries.map((d) => (
                <div key={d.id} className="flex justify-between gap-2 border-t border-line pt-1.5">
                  <span>{d.channel} · {d.event.replace(/_/g, " ").toLowerCase()}</span>
                  <span className={d.status === "SENT" ? "text-emerald-700" : d.status === "FAILED" ? "text-red-600" : "text-muted"}>{d.status.toLowerCase()} · {formatDate(d.createdAt)}</span>
                </div>
              ))}
              {inApp.map((n) => (
                <div key={n.id} className="flex justify-between gap-2 border-t border-line pt-1.5"><span>In-app · {n.title}</span><span className="text-muted">{n.readAt ? "read" : "unread"} · {formatDate(n.createdAt)}</span></div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
