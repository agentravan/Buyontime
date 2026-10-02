import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatINR } from "@/lib/money";
import { PAYMENT_METHOD_LABEL } from "@/lib/order-status";
import { getSettings } from "@/lib/settings";
import { formatDate } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { ProductImage } from "@/components/product-image";
import { AutoRefresh } from "@/components/auto-refresh";
import { orderEarnsSpinNow } from "@/server/spin";

export const metadata: Metadata = { title: "Order confirmation", robots: { index: false } };

export default async function SuccessPage({ params }: { params: Promise<{ orderNumber: string }> }) {
  const { orderNumber } = await params;
  const user = await requireUser();
  const order = await db.order.findUnique({
    where: { orderNumber },
    include: { items: true, payments: { orderBy: { createdAt: "desc" } } },
  });
  if (!order || order.userId !== user.id) notFound();
  const settings = await getSettings();
  const paid = order.paymentStatus === "PAID";
  const cod = order.paymentMethod === "COD";
  const processing = !cod && ["PENDING", "AUTHORIZED"].includes(order.paymentStatus) && order.status === "PENDING_PAYMENT";
  const failed = !cod && order.paymentStatus === "FAILED";
  const payment = order.payments.find((p) => p.status === "PAID") ?? order.payments[0];
  const eta = new Date(order.createdAt.getTime() + settings.estimatedDeliveryDays * 86400000);

  return (
    <div className="container-page max-w-3xl py-8">
      {processing && <AutoRefresh intervalMs={3000} maxTimes={20} />}
      <Card className="p-6 text-center sm:p-8">
        {cod || paid ? (
          <CheckCircle2 className="mx-auto size-14 text-emerald-600" />
        ) : failed ? (
          <XCircle className="mx-auto size-14 text-red-600" />
        ) : (
          <Clock className="mx-auto size-14 text-amber-500" />
        )}
        <h1 className="mt-3 text-2xl font-extrabold tracking-tight">
          {cod ? "Order placed successfully" : paid ? "Payment Successful" : failed ? "Payment Failed" : "Confirming your payment…"}
        </h1>
        <p className="mt-2 text-sm text-muted">
          {cod
            ? "Your order is confirmed. Please pay when it's delivered."
            : paid
              ? "Your payment was verified and your order is confirmed."
              : failed
                ? "No money was taken for the failed attempt. You can retry from your order page."
                : "This usually takes a few seconds. This page updates automatically."}
        </p>
        <dl className="mx-auto mt-6 grid max-w-md grid-cols-2 gap-x-4 gap-y-2 text-left text-sm">
          <dt className="text-muted">Order ID</dt><dd className="font-bold">{order.orderNumber}</dd>
          {payment?.razorpayPaymentId && <><dt className="text-muted">Payment ID</dt><dd className="break-all font-semibold">{payment.razorpayPaymentId}</dd></>}
          <dt className="text-muted">Amount</dt><dd className="font-bold">{formatINR(order.total)}</dd>
          <dt className="text-muted">Payment method</dt><dd className="font-semibold">{PAYMENT_METHOD_LABEL[order.paymentMethod]}{payment?.gatewayMethod ? ` (${payment.gatewayMethod.toUpperCase()})` : ""}</dd>
          <dt className="text-muted">Expected delivery</dt><dd className="font-semibold">By {formatDate(eta)}</dd>
        </dl>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href={`/account/orders/${order.orderNumber}`} className="rounded-xl bg-brand-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-800">{failed ? "Retry payment" : "Track order"}</Link>
          <Link href="/products" className="rounded-xl border border-line px-5 py-2.5 text-sm font-bold hover:bg-slate-50">Continue shopping</Link>
        </div>
      </Card>
      {settings.spinEnabled && settings.spinsPerOrder > 0 && !failed && order.status !== "CANCELLED" && (
        <Card className="mt-4 flex flex-wrap items-center justify-between gap-3 border-saffron-200 bg-saffron-50 p-4 sm:p-5">
          <div>
            <p className="font-bold">{orderEarnsSpinNow(order) ? `You have earned ${settings.spinsPerOrder} new spin${settings.spinsPerOrder === 1 ? "" : "s"}` : `${settings.spinsPerOrder} new spin${settings.spinsPerOrder === 1 ? " is" : "s are"} on the way`}</p>
            <p className="text-sm text-muted">
              {orderEarnsSpinNow(order)
                ? "Spin the wheel for a deal on your next order."
                : order.paymentMethod === "COD" ? "They unlock when this order is delivered." : "They unlock as soon as your payment is confirmed."}
            </p>
          </div>
          <Link href="/spin" className="rounded-xl bg-saffron-500 px-5 py-2.5 text-sm font-bold text-white hover:bg-saffron-600">{orderEarnsSpinNow(order) ? "Spin now" : "Spin & Win"}</Link>
        </Card>
      )}
      <Card className="mt-4 p-4 sm:p-5">
        <h2 className="font-bold">Order summary</h2>
        <ul className="mt-3 divide-y divide-line">
          {order.items.map((i) => (
            <li key={i.id} className="flex gap-3 py-2.5">
              <div className="relative size-14 shrink-0 overflow-hidden rounded-lg bg-slate-50"><ProductImage src={i.imageUrl} alt={i.name} sizes="56px" /></div>
              <div className="flex-1 text-sm"><p className="font-medium">{i.name}</p><p className="text-xs text-muted">{i.variantName ? `${i.variantName} · ` : ""}Qty {i.quantity}</p></div>
              <p className="text-sm font-bold">{formatINR(i.lineTotal)}</p>
            </li>
          ))}
        </ul>
        <dl className="mt-3 space-y-1 border-t border-line pt-3 text-sm">
          <div className="flex justify-between"><dt>Subtotal</dt><dd>{formatINR(order.subtotal)}</dd></div>
          {order.discount > 0 && <div className="flex justify-between text-emerald-700"><dt>Coupon {order.couponCode}</dt><dd>−{formatINR(order.discount)}</dd></div>}
          <div className="flex justify-between"><dt>Delivery</dt><dd>{order.shippingFee ? formatINR(order.shippingFee) : "FREE"}</dd></div>
          {order.codFee > 0 && <div className="flex justify-between"><dt>COD charge</dt><dd>{formatINR(order.codFee)}</dd></div>}
          <div className="flex justify-between font-extrabold"><dt>Total</dt><dd>{formatINR(order.total)}</dd></div>
        </dl>
      </Card>
    </div>
  );
}
