import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { razorpayConfig } from "@/lib/env";
import { strParam } from "@/lib/utils";
import { CheckoutForm } from "@/components/store/checkout-form";
import { buildCheckout } from "@/server/checkout";
import { getActiveDeal } from "@/server/spin";

export const metadata: Metadata = { title: "Checkout", robots: { index: false } };

export default async function CheckoutPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const g = strParam(sp.group);
  const group = g === "ONLINE" || g === "COD" ? g : null;
  // The customer's unused Spin & Win coupon is applied automatically (they can remove it).
  const active = await getActiveDeal(user.id);
  let state = await buildCheckout({ user, group, couponCode: active?.deal.code ?? null });
  // If it does not apply to this cart (e.g. below its minimum order), carry on without it.
  if (active && !state.coupon) state = await buildCheckout({ user, group });
  if (state.allLines.length === 0) redirect("/cart");
  if (state.cartAvailability.conflict && state.settings.mixedCartPolicy === "SPLIT_ORDERS" && !group) redirect("/cart");
  if (state.lines.length === 0) redirect("/cart");

  const addresses = await db.address.findMany({ where: { userId: user.id }, orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }] });
  return (
    <div className="container-page py-6">
      <h1 className="text-2xl font-extrabold tracking-tight">Checkout</h1>
      {group && (
        <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Checking out {group === "ONLINE" ? "prepaid" : "Cash-on-Delivery"} items only. {state.excluded.length} other item(s) stay in your cart for a separate order.
        </p>
      )}
      <CheckoutForm
        user={{ name: user.name, email: user.email, phone: user.phone ?? "" }}
        addresses={addresses.map((a) => ({ id: a.id, name: a.name, phone: a.phone, line1: a.line1, line2: a.line2, landmark: a.landmark, city: a.city, district: a.district, state: a.state, pincode: a.pincode, isDefault: a.isDefault }))}
        lines={state.lines.map((l) => ({ id: l.id, name: l.name, variantName: l.variantName, imageUrl: l.imageUrl, quantity: l.quantity, unitPrice: l.unitPrice, unitMrp: l.unitMrp }))}
        group={group}
        initialQuote={{ totals: state.totals, availability: state.availability, coupon: state.coupon, couponError: null, wallet: state.wallet, problems: state.problems }}
        razorpayMode={razorpayConfig().mode}
        estimatedDeliveryDays={state.settings.estimatedDeliveryDays}
        rewardCoupon={active ? { code: active.deal.code, description: active.coupon.description } : null}
        initialCouponCode={state.coupon?.code ?? null}
      />
    </div>
  );
}
