import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ShoppingCart } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { razorpayConfig } from "@/lib/env";
import { formatINR } from "@/lib/money";
import { resolvePaymentMethods } from "@/lib/payment-rules";
import { computeTotals, evaluateCoupon } from "@/lib/pricing";
import { getActiveDeal } from "@/server/spin";
import { getSettings } from "@/lib/settings";
import { Card, EmptyState } from "@/components/ui/card";
import { CartLineRow } from "@/components/store/cart-line";
import { findCartId, getCartLines } from "@/server/cart";

export const metadata: Metadata = { title: "Your cart", robots: { index: false } };

export default async function CartPage() {
  const user = await getCurrentUser();
  const settings = await getSettings();
  const lines = await getCartLines(await findCartId(user, false));

  if (lines.length === 0) {
    return (
      <div className="container-page py-10">
        <EmptyState icon={<ShoppingCart />} title="Your cart is empty" description="Browse our catalogue and add something you love." action={<Link href="/products" className="rounded-xl bg-brand-700 px-5 py-2.5 text-sm font-semibold text-white">Start shopping</Link>} />
      </div>
    );
  }

  const valid = lines.filter((l) => l.available);
  const pricingItems = valid.map((l) => ({ unitPrice: l.unitPrice, quantity: l.quantity, gstRate: l.gstRate }));
  const plain = computeTotals(pricingItems, settings);
  // The customer's unused Spin & Win coupon is applied automatically at checkout, so the cart shows it too.
  const active = settings.spinEnabled ? await getActiveDeal(user?.id) : null;
  const dealCheck = active ? evaluateCoupon(active.coupon, plain.subtotal, 0) : null;
  const dealOn = Boolean(active && dealCheck?.ok);
  const totals = dealCheck?.ok ? computeTotals(pricingItems, settings, { discount: dealCheck.discount, freeShipping: dealCheck.freeShipping }) : plain;
  const availability = resolvePaymentMethods({
    settings, gatewayConfigured: razorpayConfig().configured, customer: user,
    items: lines.map((l) => ({ productId: l.productId, name: l.name, paymentOption: l.paymentOption })),
  });
  const hasIssues = lines.some((l) => !l.available);
  const mrpTotal = valid.reduce((s, l) => s + l.unitMrp * l.quantity, 0);
  const savings = mrpTotal - totals.subtotal;
  const freeDeliveryPct = settings.freeShippingThreshold > 0
    ? Math.min(100, Math.round(((settings.freeShippingThreshold - totals.freeShippingRemaining) / settings.freeShippingThreshold) * 100))
    : 100;
  const canCheckout = !hasIssues && (availability.methods.length > 0 || (availability.conflict && availability.policy === "SPLIT_ORDERS"));

  return (
    <div className="container-page py-6">
      <h1 className="text-2xl font-extrabold tracking-tight">Your cart <span className="text-base font-semibold text-muted">({lines.reduce((s, l) => s + l.quantity, 0)} items)</span></h1>
      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-3">
          {availability.conflict && (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm">
              <p className="flex items-center gap-2 font-bold text-amber-900"><AlertTriangle className="size-4" /> {availability.message}</p>
              {availability.policy === "SPLIT_ORDERS" ? (
                <p className="mt-1 text-amber-900">You can check out the prepaid items and the Cash-on-Delivery items as two separate orders — the other items stay in your cart.</p>
              ) : (
                <p className="mt-1 text-amber-900">Remove the items marked “Prepaid only” or “COD only” to continue.</p>
              )}
            </div>
          )}
          {lines.map((l) => <CartLineRow key={l.id} line={l} />)}
        </div>
        <div className="lg:sticky lg:top-32 lg:self-start">
          <Card className="p-4 sm:p-5">
            <h2 className="font-bold">Price details</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between"><dt>Items total (MRP)</dt><dd>{formatINR(mrpTotal)}</dd></div>
              {savings > 0 && <div className="flex justify-between text-emerald-700"><dt>Discount on MRP</dt><dd>−{formatINR(savings)}</dd></div>}
              {dealOn && totals.discount > 0 && <div className="flex justify-between font-semibold text-saffron-600"><dt>Your Spin &amp; Win deal ({active?.deal.percent}% off)</dt><dd>−{formatINR(totals.discount)}</dd></div>}
              {active && dealCheck && !dealCheck.ok && <div className="rounded-lg bg-saffron-50 px-2.5 py-1.5 text-xs text-saffron-600"><b>Your Spin &amp; Win deal:</b> {dealCheck.error}</div>}
              <div className="flex justify-between"><dt>Delivery</dt><dd>{totals.shippingFee === 0 ? <span className="font-semibold text-emerald-700">FREE</span> : formatINR(totals.shippingFee)}</dd></div>
              <div className="flex justify-between border-t border-line pt-2 text-base font-extrabold"><dt>Total</dt><dd>{formatINR(totals.total)}</dd></div>
            </dl>
            {settings.freeShippingThreshold > 0 && valid.length > 0 && (
              <div className="mt-3 rounded-lg bg-brand-50 px-3 py-2.5">
                <p className="text-xs font-semibold text-brand-800">
                  {totals.freeShippingRemaining > 0
                    ? <>Add {formatINR(totals.freeShippingRemaining)} more for free delivery</>
                    : <>You have unlocked free delivery</>}
                </p>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-brand-100" role="progressbar" aria-label="Progress to free delivery" aria-valuemin={0} aria-valuemax={100} aria-valuenow={freeDeliveryPct}>
                  <div className="h-full rounded-full bg-brand-600" style={{ width: `${freeDeliveryPct}%` }} />
                </div>
                {totals.freeShippingRemaining > 0 && (
                  <Link href="/products" className="mt-1.5 inline-block text-xs font-semibold text-brand-700 hover:underline">Add more items</Link>
                )}
              </div>
            )}
            {savings > 0 && <p className="mt-2 text-xs font-semibold text-emerald-700">You save {formatINR(savings)} on this order</p>}
            <p className="mt-2 text-xs text-muted">{dealOn ? `Your coupon ${active?.deal.code} is applied automatically at checkout. ` : ""}COD charges (if any) are added at checkout.</p>
            {settings.spinEnabled && !active && <p className="mt-1 text-xs"><Link href="/spin" className="font-semibold text-saffron-600 hover:underline">Spin &amp; Win</Link> <span className="text-muted">— see if you have a spin waiting.</span></p>}

            <div className="mt-4 space-y-2">
              {availability.conflict && availability.policy === "SPLIT_ORDERS" ? (
                <>
                  <Link href="/checkout?group=ONLINE" className="flex h-11 items-center justify-center rounded-xl bg-brand-700 text-sm font-bold text-white hover:bg-brand-800">Checkout prepaid items</Link>
                  <Link href="/checkout?group=COD" className="flex h-11 items-center justify-center rounded-xl border border-brand-700 text-sm font-bold text-brand-700 hover:bg-brand-50">Checkout COD items</Link>
                </>
              ) : canCheckout ? (
                <Link href="/checkout" className="flex h-12 items-center justify-center rounded-xl bg-saffron-500 text-base font-bold text-white hover:bg-saffron-600">Proceed to checkout</Link>
              ) : (
                <p className="rounded-lg bg-red-50 p-3 text-xs font-semibold text-red-700">
                  {hasIssues ? "Update or remove the unavailable items to continue." : availability.message ?? "These items cannot be purchased right now."}
                </p>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
