import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { db } from "@/lib/db";
import { formatINR } from "@/lib/money";
import { ORDER_TRANSITIONS, PAYMENT_METHOD_LABEL, RETURN_STATUS_LABEL } from "@/lib/order-status";
import { can } from "@/lib/permissions";
import { getSettings } from "@/lib/settings";
import { formatDate } from "@/lib/utils";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MethodBadge, OrderStatusBadge, PaymentStatusBadge } from "@/components/status";
import { ProductImage } from "@/components/product-image";
import { OrderAdminActions } from "@/components/admin/order-actions";
import { ProfitBreakdown } from "@/components/admin/profit-breakdown";
import { requireStaffPage } from "@/server/admin-guard";
import { orderProfit, profitInclude } from "@/server/profit";

export const metadata: Metadata = { title: "Order details" };

export default async function AdminOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireStaffPage("orders:view");
  const { id } = await params;
  const order = await db.order.findUnique({
    where: { id },
    include: {
      ...profitInclude,
      payments: { orderBy: { createdAt: "desc" } },
      refunds: { orderBy: { createdAt: "desc" } },
      events: { orderBy: { createdAt: "desc" } },
      user: { select: { id: true, name: true, email: true, phone: true, createdAt: true, codBlocked: true, _count: { select: { orders: true } } } },
    },
  });
  if (!order) notFound();
  const settings = await getSettings();
  const finance = can(user.role, "finance:view");
  const profit = finance ? orderProfit(order, settings) : null;
  const addr = order.shippingAddress as Record<string, string | null>;
  const refundable = order.payments
    .filter((p) => ["PAID", "REFUND_PENDING", "PARTIALLY_REFUNDED"].includes(p.status))
    .reduce((s, p) => s + p.amount, 0) - order.refunds.filter((r) => r.status !== "FAILED").reduce((s, r) => s + r.amount, 0);
  const itemDiscount = (lineTotal: number) => (order.subtotal > 0 ? Math.round((lineTotal * order.discount) / order.subtotal) : 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/admin/orders" className="text-sm font-semibold text-brand-700 hover:underline">← Orders</Link>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight">{order.orderNumber}</h1>
          <p className="text-sm text-muted">Placed {formatDate(order.createdAt, true)}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <OrderStatusBadge status={order.status} />
          <PaymentStatusBadge status={order.paymentStatus} withIcon />
          <MethodBadge method={order.paymentMethod} />
        </div>
      </div>

      {order.needsAttention && (
        <div className="flex items-start gap-2 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" /> <span className="flex-1"><b>Action required:</b> {order.needsAttention}</span>
        </div>
      )}

      <OrderAdminActions
        orderId={order.id}
        status={order.status}
        nextStatuses={ORDER_TRANSITIONS[order.status]}
        paymentMethod={order.paymentMethod}
        paymentStatus={order.paymentStatus}
        shipment={{ courier: order.shipment?.courier ?? "", trackingId: order.shipment?.trackingId ?? "", trackingUrl: order.shipment?.trackingUrl ?? "", actualCost: order.shipment?.actualCost ?? null }}
        canUpdate={can(user.role, "orders:update")}
        canCollect={can(user.role, "payments:reconcile")}
        canRefund={can(user.role, "refunds:manage")}
        refundable={Math.max(0, refundable)}
        needsAttention={Boolean(order.needsAttention)}
      />

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Card>
            <CardHeader><CardTitle>Products</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-muted"><tr><th className="px-4 py-2">Item</th><th className="px-2 py-2">SKU</th><th className="px-2 py-2 text-right">Qty</th><th className="px-2 py-2 text-right">Price</th><th className="px-2 py-2 text-right">Discount</th><th className="px-4 py-2 text-right">Total</th></tr></thead>
                <tbody>
                  {order.items.map((i) => (
                    <tr key={i.id} className="border-t border-line">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-3">
                          <div className="relative size-12 shrink-0 overflow-hidden rounded-lg bg-slate-50"><ProductImage src={i.imageUrl} alt={i.name} sizes="48px" /></div>
                          <div><Link href={`/admin/products/${i.productId}`} className="font-medium hover:text-brand-700">{i.name}</Link>{i.variantName && <p className="text-xs text-muted">{i.variantName}</p>}{i.returnedQuantity > 0 && <p className="text-xs text-orange-600">{i.returnedQuantity} returned</p>}</div>
                        </div>
                      </td>
                      <td className="px-2 font-mono text-xs">{i.sku}</td>
                      <td className="px-2 text-right">{i.quantity}</td>
                      <td className="px-2 text-right">{formatINR(i.unitPrice)}</td>
                      <td className="px-2 text-right text-emerald-700">{itemDiscount(i.lineTotal) ? `−${formatINR(itemDiscount(i.lineTotal))}` : "—"}</td>
                      <td className="px-4 text-right font-semibold">{formatINR(i.lineTotal - itemDiscount(i.lineTotal))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <dl className="space-y-1 border-t border-line px-4 py-3 text-sm">
                <div className="flex justify-between"><dt>Subtotal</dt><dd>{formatINR(order.subtotal)}</dd></div>
                {order.discount > 0 && <div className="flex justify-between text-emerald-700"><dt>Coupon {order.couponCode}</dt><dd>−{formatINR(order.discount)}</dd></div>}
                <div className="flex justify-between"><dt>Shipping charged</dt><dd>{formatINR(order.shippingFee)}</dd></div>
                {order.codFee > 0 && <div className="flex justify-between"><dt>COD fee</dt><dd>{formatINR(order.codFee)}</dd></div>}
                <div className="flex justify-between font-extrabold"><dt>Total</dt><dd>{formatINR(order.total)}</dd></div>
                <div className="flex justify-between text-xs text-muted"><dt>GST included</dt><dd>{formatINR(order.gstAmount)}</dd></div>
              </dl>
            </CardContent>
          </Card>

          {finance && (
            <Card>
              <CardHeader><CardTitle>Payment</CardTitle><span className="text-sm">{PAYMENT_METHOD_LABEL[order.paymentMethod]}</span></CardHeader>
              <CardContent className="space-y-3">
                {order.payments.map((p) => (
                  <div key={p.id} className="rounded-xl border border-line p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <PaymentStatusBadge status={p.status} withIcon />
                      <span className="font-bold">{formatINR(p.amount)}</span>
                    </div>
                    <dl className="mt-2 grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
                      {p.razorpayOrderId && <><dt className="text-muted">Razorpay order ID</dt><dd className="font-mono">{p.razorpayOrderId}</dd></>}
                      {p.razorpayPaymentId && <><dt className="text-muted">Razorpay payment ID</dt><dd className="font-mono">{p.razorpayPaymentId}</dd></>}
                      {p.gatewayStatus && <><dt className="text-muted">Gateway status</dt><dd>{p.gatewayStatus}{p.gatewayMethod ? ` · ${p.gatewayMethod}` : ""}</dd></>}
                      <dt className="text-muted">Signature verified</dt><dd>{p.method === "COD" ? "n/a (COD)" : p.signatureVerified ? "Yes" : "No (webhook/API confirmed)"}</dd>
                      {p.gatewayFee !== null && <><dt className="text-muted">Razorpay fee (incl. GST)</dt><dd>{formatINR(p.gatewayFee)}</dd></>}
                      {p.refundedAmount > 0 && <><dt className="text-muted">Refunded</dt><dd>{formatINR(p.refundedAmount)}</dd></>}
                      {p.failureReason && <><dt className="text-muted">Failure reason</dt><dd className="text-red-600">{p.failureReason}</dd></>}
                      {p.reconciliationStatus === "MISMATCH" && <><dt className="text-muted">Reconciliation</dt><dd className="font-bold text-amber-700">⚠ {p.reconciliationNote}</dd></>}
                      <dt className="text-muted">Created</dt><dd>{formatDate(p.createdAt, true)}</dd>
                    </dl>
                  </div>
                ))}
                {order.refunds.length > 0 && (
                  <div>
                    <p className="mb-1 text-sm font-bold">Refunds</p>
                    {order.refunds.map((r) => (
                      <div key={r.id} className="flex flex-wrap justify-between gap-2 border-t border-line py-2 text-xs">
                        <span>{formatDate(r.createdAt, true)} · {r.mode === "RAZORPAY" ? `Razorpay ${r.razorpayRefundId ?? ""}` : `Manual (${r.reference})`} · {r.reason}</span>
                        <span className="font-semibold">{formatINR(r.amount)} · <Badge tone={r.status === "PROCESSED" ? "blue" : r.status === "FAILED" ? "red" : "purple"}>{r.status}</Badge></span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {profit && <ProfitBreakdown profit={profit} />}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Customer</CardTitle>{can(user.role, "customers:view") && <Link href={`/admin/customers/${order.user.id}`} className="text-xs font-semibold text-brand-700">Customer 360 →</Link>}</CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p className="font-semibold">{order.customerName}</p>
              <p>{order.phone}</p>
              {can(user.role, "customers:view") && <p className="break-all text-muted">{order.email}</p>}
              {can(user.role, "customers:view") && <p className="text-xs text-muted">{order.user._count.orders} orders · customer since {formatDate(order.user.createdAt)}</p>}
              {order.user.codBlocked && <Badge tone="red">COD blocked</Badge>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Shipping address</CardTitle></CardHeader>
            <CardContent className="text-sm">
              <p className="font-semibold">{addr.name}</p>
              <p>{[addr.line1, addr.line2, addr.landmark].filter(Boolean).join(", ")}</p>
              <p>{addr.city}{addr.district && addr.district !== addr.city ? `, ${addr.district} district` : ""}, {addr.state} {addr.pincode}</p>
              <p>Phone: {addr.phone}</p>
              {order.customerNote && <p className="mt-2 rounded-lg bg-slate-50 p-2 text-xs">Note: {order.customerNote}</p>}
              {order.shipment && (
                <div className="mt-3 space-y-0.5 border-t border-line pt-3 text-xs">
                  <p><span className="text-muted">Courier:</span> {order.shipment.courier ?? "—"}</p>
                  <p><span className="text-muted">Tracking:</span> {order.shipment.trackingId ?? "—"}</p>
                  {order.shipment.trackingUrl && <p className="truncate"><span className="text-muted">URL:</span> <a className="text-brand-700 underline" href={order.shipment.trackingUrl} target="_blank" rel="noopener noreferrer">{order.shipment.trackingUrl}</a></p>}
                  {order.shipment.shippedAt && <p><span className="text-muted">Shipped:</span> {formatDate(order.shipment.shippedAt, true)}</p>}
                </div>
              )}
            </CardContent>
          </Card>
          {order.returns.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Returns</CardTitle><Link href="/admin/returns" className="text-xs font-semibold text-brand-700">Manage</Link></CardHeader>
              <CardContent className="space-y-2 text-sm">
                {order.returns.map((r) => <div key={r.id} className="flex justify-between gap-2"><span>{r.reason}</span><Badge tone="orange">{RETURN_STATUS_LABEL[r.status]}</Badge></div>)}
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader><CardTitle>Timeline</CardTitle></CardHeader>
            <CardContent>
              <ol className="space-y-3 border-l-2 border-line pl-4">
                {order.events.map((e) => (
                  <li key={e.id} className="relative text-sm">
                    <span className="absolute -left-[21px] top-1.5 size-2.5 rounded-full bg-brand-600 ring-2 ring-white" />
                    <p>{e.message}</p>
                    <p className="text-[11px] text-muted">{formatDate(e.createdAt, true)}</p>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
