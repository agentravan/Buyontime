import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, MapPin, Truck } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatINR } from "@/lib/money";
import { CUSTOMER_CANCELLABLE, CUSTOMER_PAYMENT_LABEL, PAYMENT_METHOD_LABEL, RETURN_STATUS_LABEL, buildTimeline } from "@/lib/order-status";
import { getSettings } from "@/lib/settings";
import { cn, formatDate, strParam } from "@/lib/utils";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OrderStatusBadge, PaymentStatusBadge } from "@/components/status";
import { ProductImage } from "@/components/product-image";
import { OrderActions } from "@/components/store/order-actions";
import { AutoRefresh } from "@/components/auto-refresh";

export const metadata: Metadata = { title: "Order details", robots: { index: false } };

export default async function OrderDetailPage({ params, searchParams }: { params: Promise<{ orderNumber: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { orderNumber } = await params;
  const sp = await searchParams;
  const user = await requireUser();
  const order = await db.order.findUnique({
    where: { orderNumber },
    include: {
      items: true, shipment: true,
      payments: { orderBy: { createdAt: "desc" } },
      refunds: { orderBy: { createdAt: "desc" } },
      returns: { orderBy: { createdAt: "desc" }, include: { items: true } },
      events: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!order || order.userId !== user.id) notFound();
  const settings = await getSettings();

  const timeline = buildTimeline({ ...order, shippedAt: order.shipment?.shippedAt ?? null });
  const addr = order.shippingAddress as Record<string, string | null>;
  const payLabel = order.paymentMethod === "COD" && order.paymentStatus === "PENDING" ? "Pay on Delivery" : CUSTOMER_PAYMENT_LABEL[order.paymentStatus];
  const canRetry = order.paymentMethod === "ONLINE" && order.status === "PENDING_PAYMENT" && (!order.paymentExpiresAt || order.paymentExpiresAt > new Date());
  const canCancel = CUSTOMER_CANCELLABLE.includes(order.status);
  const withinWindow = order.deliveredAt && Date.now() - order.deliveredAt.getTime() <= settings.returnWindowDays * 86400000;
  const returnable = order.items
    .map((i) => {
      const inProgress = order.returns.filter((r) => r.status !== "REJECTED").flatMap((r) => r.items).filter((ri) => ri.orderItemId === i.id).reduce((s, ri) => s + ri.quantity, 0);
      return { id: i.id, name: i.name, max: i.quantity - inProgress };
    })
    .filter((i) => i.max > 0);
  const canReturn = Boolean(withinWindow) && ["DELIVERED", "RETURN_REQUESTED", "RETURNED"].includes(order.status) && returnable.length > 0;
  const paidPayment = order.payments.find((p) => p.razorpayPaymentId && ["PAID", "REFUND_PENDING", "REFUNDED", "PARTIALLY_REFUNDED"].includes(p.status));
  const stopped = ["CANCELLED", "RTO"].includes(order.status);
  const awaitingConfirmation = order.paymentMethod === "ONLINE" && order.paymentStatus === "AUTHORIZED";

  return (
    <div className="space-y-4">
      {awaitingConfirmation && <AutoRefresh intervalMs={4000} maxTimes={15} />}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/account/orders" className="text-sm font-semibold text-brand-700 hover:underline">← All orders</Link>
          <h1 className="mt-1 text-xl font-extrabold">Order {order.orderNumber}</h1>
          <p className="text-sm text-muted">Placed on {formatDate(order.createdAt, true)}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <OrderStatusBadge status={order.status} />
          <PaymentStatusBadge status={order.paymentStatus} label={payLabel} />
        </div>
      </div>

      {(sp.payment === "failed" || order.paymentStatus === "FAILED") && order.status === "PENDING_PAYMENT" && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p className="font-bold">Payment Failed — Try Again</p>
          <p>{order.payments[0]?.failureReason ?? "Your payment did not go through."} Your items are held until {order.paymentExpiresAt ? formatDate(order.paymentExpiresAt, true) : "shortly"}.</p>
        </div>
      )}
      {order.paymentStatus === "REFUND_PENDING" && <div className="rounded-2xl bg-violet-50 p-4 text-sm font-semibold text-violet-800">Refund Processing — refunds usually reach your account in 5–7 working days.</div>}
      {order.paymentStatus === "REFUNDED" && <div className="rounded-2xl bg-sky-50 p-4 text-sm font-semibold text-sky-800">Refund Completed — {formatINR(order.refunds.filter((r) => r.status === "PROCESSED").reduce((s, r) => s + r.amount, 0))} refunded.</div>}

      <OrderActions
        orderNumber={order.orderNumber}
        canRetry={canRetry}
        canCancel={canCancel}
        canReturn={canReturn}
        returnable={returnable}
        paid={Boolean(paidPayment)}
      />

      <Card>
        <CardHeader><CardTitle>Order tracking</CardTitle></CardHeader>
        <CardContent>
          {stopped ? (
            <p className="text-sm font-semibold text-red-700">{order.status === "CANCELLED" ? `Order cancelled${order.cancelReason ? ` — ${order.cancelReason}` : ""}` : "Delivery was unsuccessful and the parcel was returned to us."}</p>
          ) : (
            <ol className="relative space-y-0">
              {timeline.map((s, i) => (
                <li key={s.key} className="relative flex gap-3 pb-5 last:pb-0">
                  {i < timeline.length - 1 && <span className={cn("absolute left-[11px] top-6 h-[calc(100%-12px)] w-0.5", timeline[i + 1].done ? "bg-emerald-500" : "bg-slate-200")} />}
                  <span className={cn("relative z-10 grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold", s.done ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-500")}>{s.done ? "✓" : i + 1}</span>
                  <div className="pt-0.5">
                    <p className={cn("text-sm", s.done ? "font-semibold" : "text-muted", s.current && "text-emerald-700")}>{s.label}</p>
                    {s.at && s.done && <p className="text-xs text-muted">{formatDate(s.at, true)}</p>}
                  </div>
                </li>
              ))}
            </ol>
          )}
          {order.shipment?.trackingId && (
            <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 p-3 text-sm">
              <Truck className="size-4 text-brand-700" />
              <span>{order.shipment.courier ?? "Courier"} · Tracking <b>{order.shipment.trackingId}</b></span>
              {order.shipment.trackingUrl && /^https?:\/\//.test(order.shipment.trackingUrl) && (
                <a href={order.shipment.trackingUrl} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex items-center gap-1 font-semibold text-brand-700">Track <ExternalLink className="size-3.5" /></a>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Items</CardTitle></CardHeader>
          <CardContent className="divide-y divide-line py-2">
            {order.items.map((i) => (
              <div key={i.id} className="flex gap-3 py-2.5">
                <div className="relative size-14 shrink-0 overflow-hidden rounded-lg bg-slate-50"><ProductImage src={i.imageUrl} alt={i.name} sizes="56px" /></div>
                <div className="flex-1 text-sm">
                  <p className="font-medium">{i.name}</p>
                  <p className="text-xs text-muted">{i.variantName ? `${i.variantName} · ` : ""}Qty {i.quantity}{i.returnedQuantity ? ` · ${i.returnedQuantity} returned` : ""}</p>
                </div>
                <p className="text-sm font-bold">{formatINR(i.lineTotal)}</p>
              </div>
            ))}
          </CardContent>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Payment</CardTitle></CardHeader>
            <CardContent className="space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-muted">Method</span><span className="font-semibold">{PAYMENT_METHOD_LABEL[order.paymentMethod]}</span></div>
              <div className="flex justify-between"><span className="text-muted">Status</span><span className="font-semibold">{payLabel}</span></div>
              {paidPayment?.razorpayPaymentId && <div className="flex justify-between gap-2"><span className="text-muted">Payment ID</span><span className="break-all font-mono text-xs">{paidPayment.razorpayPaymentId}</span></div>}
              <div className="flex justify-between border-t border-line pt-2"><span>Subtotal</span><span>{formatINR(order.subtotal)}</span></div>
              {order.discount > 0 && <div className="flex justify-between text-emerald-700"><span>Coupon {order.couponCode}</span><span>−{formatINR(order.discount)}</span></div>}
              <div className="flex justify-between"><span>Delivery</span><span>{order.shippingFee ? formatINR(order.shippingFee) : "FREE"}</span></div>
              {order.codFee > 0 && <div className="flex justify-between"><span>COD charge</span><span>{formatINR(order.codFee)}</span></div>}
              <div className="flex justify-between text-base font-extrabold"><span>Total</span><span>{formatINR(order.total)}</span></div>
              {order.refunds.length > 0 && (
                <div className="mt-2 space-y-1 border-t border-line pt-2">
                  {order.refunds.map((r) => (
                    <div key={r.id} className="flex justify-between text-xs"><span>Refund {formatDate(r.createdAt)}</span><span className="font-semibold">{formatINR(r.amount)} · {r.status === "PROCESSED" ? "Completed" : r.status === "FAILED" ? "Failed" : "Processing"}</span></div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Delivery address</CardTitle></CardHeader>
            <CardContent className="flex gap-2 text-sm">
              <MapPin className="mt-0.5 size-4 shrink-0 text-brand-700" />
              <p><b>{addr.name}</b><br />{[addr.line1, addr.line2, addr.landmark].filter(Boolean).join(", ")}<br />{addr.city}, {addr.state} {addr.pincode}<br />Phone: {addr.phone}</p>
            </CardContent>
          </Card>
          {order.returns.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Returns</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                {order.returns.map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-2">
                    <span>{formatDate(r.createdAt)} · {r.reason}</span>
                    <Badge tone={r.status === "REJECTED" ? "red" : r.status === "REFUNDED" ? "blue" : "orange"}>{RETURN_STATUS_LABEL[r.status]}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
