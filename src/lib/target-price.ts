import type { GstMode } from "@prisma/client";
import { calculateUnitProfit } from "@/lib/profit";

/**
 * Selling price that guarantees a minimum profit per unit (default ₹120) after GST, Razorpay fee,
 * packaging and the COD collection charge — whichever payment method the customer picks.
 * Pure code (no database) so it can be unit-tested. All amounts in paise.
 */

export type TargetPriceSettings = {
  gstMode: GstMode;
  claimInputTaxCredit: boolean;
  gatewayFeeBps: number;
  packagingCostPerOrder: number;
  codCollectionCharge: number;
};

export type TargetPriceInput = { costPrice: number; shippingCost: number; otherCost: number; gstRate: number };

export const DEFAULT_TARGET_PROFIT = 12_000; // ₹120

/** Worst-case profit for one unit sold alone (online pays the gateway fee; COD pays the collection charge). */
export function worstCaseUnitProfit(price: number, p: TargetPriceInput, s: TargetPriceSettings): number {
  const online = calculateUnitProfit({ price, ...p }, s, "ONLINE").profit;
  const cod = calculateUnitProfit({ price, ...p }, s, "COD").profit - s.codCollectionCharge;
  return Math.min(online, cod) - s.packagingCostPerOrder;
}

/** Rounds up to a retail-friendly whole-rupee price ending in 9 (e.g. ₹341 → ₹349). */
export function retailRound(paise: number): number {
  const rupees = Math.ceil(paise / 100);
  return (rupees % 10 === 9 ? rupees : rupees + ((9 - (rupees % 10) + 10) % 10)) * 100;
}

/** Smallest retail-rounded price whose worst-case profit is at least the target. */
export function priceForTargetProfit(p: TargetPriceInput, s: TargetPriceSettings, target = DEFAULT_TARGET_PROFIT): { price: number; profit: number } {
  // Profit is increasing in price, so start from the cost floor and step up in ₹10 retail steps.
  let price = retailRound(p.costPrice + p.shippingCost + p.otherCost + target);
  for (let i = 0; i < 10_000 && worstCaseUnitProfit(price, p, s) < target; i++) price += 1000;
  return { price, profit: worstCaseUnitProfit(price, p, s) };
}
