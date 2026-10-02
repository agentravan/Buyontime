"use client";

import { createContext, useContext } from "react";
import Link from "next/link";
import { Tag } from "lucide-react";
import { formatINR } from "@/lib/money";
import { dealUnitPrice, type Deal } from "@/lib/spin";

const DealContext = createContext<Deal | null>(null);

/** Makes the signed-in customer's unused Spin & Win coupon available to every price on the page. */
export function DealProvider({ deal, children }: { deal: Deal | null; children: React.ReactNode }) {
  return <DealContext.Provider value={deal}>{children}</DealContext.Provider>;
}

export function useDeal(): Deal | null {
  return useContext(DealContext);
}

/**
 * "₹279 with your 20% coupon" under a product's price. Shown only when the coupon really applies
 * to that item on its own, so the number always matches what checkout charges.
 */
export function DealPrice({ price, size = "md" }: { price: number; size?: "md" | "lg" }) {
  const deal = useDeal();
  const dealPrice = dealUnitPrice(price, deal);
  if (!deal || dealPrice === null) return null;
  return (
    <p className={size === "lg" ? "mt-1 text-base font-bold text-saffron-600" : "text-xs font-bold text-saffron-600"}>
      {formatINR(dealPrice)} <span className="font-semibold">with your {deal.percent}% coupon</span>
    </p>
  );
}

function endsOn(iso: string | null): string {
  if (!iso) return "";
  return ` or on ${new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" })}`;
}

/** A slim strip under the header while the customer has an unused spin coupon. */
export function DealBar() {
  const deal = useDeal();
  if (!deal) return null;
  const what = deal.percent
    ? `${deal.percent}% off${deal.maxDiscount !== null ? ` (up to ${formatINR(deal.maxDiscount)})` : ""}${deal.minOrder > 0 ? ` on orders above ${formatINR(deal.minOrder)}` : ""}`
    : "free delivery on your order";
  return (
    <div className="border-b border-saffron-200 bg-saffron-50 text-saffron-600">
      <div className="container-page flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 py-1.5 text-center text-xs font-semibold sm:text-[13px]">
        <Tag className="size-3.5" />
        <span className="text-ink">Your Spin &amp; Win deal: <b>{what}</b>. It is applied at checkout and ends when you order{endsOn(deal.expiresAt)}.</span>
        <Link href="/?spin=1" className="underline">Details</Link>
      </div>
    </div>
  );
}
