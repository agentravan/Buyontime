"use client";

import { createContext, useContext } from "react";
import Link from "next/link";
import { Crown } from "lucide-react";
import { DealPrice } from "@/components/store/deal";
import { discountPercent, formatINR } from "@/lib/money";

type MemberState = { isMember: boolean };

const MemberContext = createContext<MemberState>({ isMember: false });

/** Tells every price on the page whether the signed-in customer is a BuyOnTime Plus member. */
export function MemberProvider({ isMember, children }: { isMember: boolean; children: React.ReactNode }) {
  return <MemberContext.Provider value={{ isMember }}>{children}</MemberContext.Provider>;
}

export function useMember(): MemberState {
  return useContext(MemberContext);
}

/**
 * Product price with the BuyOnTime Plus member price.
 * - Members see the member price as the price they pay, with the regular price for comparison.
 * - Everyone else sees the regular price and, under it, the member price and what joining saves.
 * The saving is shown in rupees, which is exactly what checkout takes off.
 */
export function Price({ price, mrp, memberPrice = null, size = "md" }: { price: number; mrp: number; memberPrice?: number | null; size?: "md" | "lg" }) {
  const { isMember } = useMember();
  const lg = size === "lg";
  const hasMember = memberPrice !== null && memberPrice < price;
  const pays = isMember && hasMember ? memberPrice : price;
  const off = discountPercent(mrp, pays);
  const save = hasMember ? price - memberPrice : 0;
  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className={lg ? "text-2xl font-extrabold" : "text-base font-extrabold"}>{formatINR(pays)}</span>
        {off > 0 && (
          <>
            <span className={lg ? "text-base text-muted line-through" : "text-xs text-muted line-through"}>{formatINR(mrp)}</span>
            <span className={lg ? "text-base font-bold text-emerald-600" : "text-xs font-bold text-emerald-600"}>{off}% off</span>
          </>
        )}
      </div>
      {hasMember && (isMember ? (
        <p className={lg ? "mt-1 inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700" : "inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700"}>
          <Crown className={lg ? "size-4 text-[#c9971c]" : "size-3 text-[#c9971c]"} /> Plus member price · you save {formatINR(save)} (regular {formatINR(price)})
        </p>
      ) : lg ? (
        <Link href="/membership" className="mt-2 flex items-center gap-2 rounded-xl bg-[#0b1220] px-3 py-2 text-sm text-white">
          <Crown className="size-4 shrink-0 text-[#ffe08a]" />
          <span>Member price <b className="text-[#ffe08a]">{formatINR(memberPrice)}</b> · save {formatINR(save)} with BuyOnTime Plus</span>
        </Link>
      ) : (
        <p className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#8a6410]">
          <Crown className="size-3 text-[#c9971c]" /> Member price {formatINR(memberPrice)}
        </p>
      ))}
      {/* Extra price line for a customer holding an unused Spin & Win coupon. */}
      <DealPrice price={pays} size={size} />
    </div>
  );
}
