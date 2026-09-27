import type { GstMode, OrderStatus, PaymentMethod, PaymentStatus } from "@prisma/client";
import { bpsOf, gstIncluded } from "@/lib/money";

/**
 * Transparent profit engine. Every number is a line item with an explanation, so the admin can see
 * exactly how "Estimated net profit" was calculated. All amounts in paise.
 */

export type ProfitSettings = {
  gstMode: GstMode;
  claimInputTaxCredit: boolean;
  gatewayFeeBps: number;
  packagingCostPerOrder: number;
  codCollectionCharge: number;
  codRtoRatePct: number;
};

export type ProfitOrderItem = {
  quantity: number;
  /** Units returned in resellable condition (their cost is recovered). */
  recoveredQuantity: number;
  unitCost: number;
  unitShippingCost: number;
  unitOtherCost: number;
  gstRate: number;
};

export type ProfitOrder = {
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  total: number;
  gstAmount: number;
  items: ProfitOrderItem[];
  /** Sum of processed refunds (paise). */
  refunded: number;
  /** Actual gateway fee reported by Razorpay, if known. */
  gatewayFeeActual: number | null;
  shippingActual: number | null;
  returnShippingActual: number | null;
};

export type ProfitLine = { key: string; label: string; amount: number; note: string };

export type ProfitResult = {
  lines: ProfitLine[];
  revenue: number;
  costs: number;
  profit: number;
  marginPct: number;
  isEstimate: boolean;
};

const OPEN_STATUSES: OrderStatus[] = ["CONFIRMED", "PROCESSING", "SHIPPED", "OUT_FOR_DELIVERY"];

export function calculateOrderProfit(order: ProfitOrder, s: ProfitSettings): ProfitResult {
  const lines: ProfitLine[] = [];
  const paidOnline = order.paymentMethod === "ONLINE" && ["PAID", "REFUND_PENDING", "REFUNDED", "PARTIALLY_REFUNDED"].includes(order.paymentStatus);

  if (order.status === "PENDING_PAYMENT" || (order.status === "CANCELLED" && !paidOnline)) {
    return {
      lines: [{ key: "none", label: "No revenue", amount: 0, note: order.status === "CANCELLED" ? "Order cancelled before payment/fulfilment." : "Awaiting payment." }],
      revenue: 0, costs: 0, profit: 0, marginPct: 0, isEstimate: order.status === "PENDING_PAYMENT",
    };
  }

  const isCancelled = order.status === "CANCELLED";
  const isRto = order.status === "RTO";
  const isEstimate = OPEN_STATUSES.includes(order.status) || (order.paymentMethod === "COD" && order.paymentStatus !== "PAID");

  // Revenue
  const grossRevenue = isRto && order.paymentMethod === "COD" ? 0 : order.total;
  lines.push({
    key: "revenue",
    label: "Revenue",
    amount: grossRevenue,
    note: isRto && order.paymentMethod === "COD"
      ? "COD order returned to origin — nothing collected."
      : order.paymentMethod === "COD" && order.paymentStatus !== "PAID"
        ? "Order total (COD not yet collected)."
        : "Amount paid by the customer incl. shipping/COD fees.",
  });
  if (order.refunded > 0) lines.push({ key: "refunds", label: "Refunds", amount: -order.refunded, note: "Processed refunds." });
  const netRevenue = grossRevenue - order.refunded;

  // Output GST
  if (s.gstMode === "REGISTERED" && order.total > 0 && netRevenue > 0) {
    const gst = Math.round((order.gstAmount * netRevenue) / order.total);
    lines.push({ key: "gst", label: "GST payable", amount: -gst, note: "GST included in selling price, payable to government." });
  }

  // Product cost (not incurred if cancelled before shipping; recovered for resellable returns / RTO)
  if (!isCancelled) {
    let cost = 0;
    let itc = 0;
    for (const i of order.items) {
      const keptQty = isRto ? 0 : Math.max(0, i.quantity - i.recoveredQuantity);
      const c = i.unitCost * keptQty;
      cost += c;
      if (s.gstMode === "REGISTERED" && s.claimInputTaxCredit) itc += gstIncluded(c, i.gstRate);
    }
    lines.push({ key: "productCost", label: "Product cost", amount: -cost, note: isRto ? "Goods returned to stock (RTO)." : "Purchase cost of items kept by the customer." });
    if (itc > 0) lines.push({ key: "itc", label: "Input tax credit", amount: itc, note: "GST credit on purchase cost." });

    // Forward shipping
    const shipEstimate = order.items.reduce((sum, i) => sum + i.unitShippingCost * i.quantity, 0);
    const ship = order.shippingActual ?? shipEstimate;
    lines.push({ key: "shipping", label: "Shipping cost", amount: -ship, note: order.shippingActual !== null ? "Actual courier charge." : "Estimated from product shipping costs." });

    // Return / RTO shipping
    if (isRto || order.status === "RETURNED") {
      const ret = order.returnShippingActual ?? ship;
      lines.push({ key: "rto", label: isRto ? "RTO cost" : "Return shipping", amount: -ret, note: order.returnShippingActual !== null ? "Actual return charge." : "Estimated as equal to forward shipping." });
    } else if (order.paymentMethod === "COD" && OPEN_STATUSES.includes(order.status) && s.codRtoRatePct > 0) {
      const provision = Math.round(((ship * 2 + 0) * s.codRtoRatePct) / 100);
      lines.push({ key: "rtoProvision", label: "RTO risk provision", amount: -provision, note: `Estimate: ${s.codRtoRatePct}% of COD orders return (two-way shipping).` });
    }

    // Other costs
    const other = order.items.reduce((sum, i) => sum + i.unitOtherCost * i.quantity, 0) + s.packagingCostPerOrder;
    if (other > 0) lines.push({ key: "other", label: "Other costs", amount: -other, note: "Packaging and per-unit other costs." });
  }

  // Payment collection cost
  if (order.paymentMethod === "ONLINE" && paidOnline) {
    const fee = order.gatewayFeeActual ?? bpsOf(order.total, s.gatewayFeeBps);
    lines.push({ key: "gateway", label: "Razorpay fee", amount: -fee, note: order.gatewayFeeActual !== null ? "Actual fee + GST reported by Razorpay." : `Estimated at ${(s.gatewayFeeBps / 100).toFixed(2)}%.` });
  } else if (order.paymentMethod === "COD" && !isCancelled && !isRto && s.codCollectionCharge > 0) {
    lines.push({ key: "codCharge", label: "COD collection charge", amount: -s.codCollectionCharge, note: "Courier COD handling charge." });
  }

  const revenue = netRevenue;
  const profit = lines.reduce((sum, l) => sum + l.amount, 0);
  const costs = revenue - profit;
  const marginPct = revenue > 0 ? Math.round((profit / revenue) * 1000) / 10 : 0;
  return { lines, revenue, costs, profit, marginPct, isEstimate };
}

/** Per-unit estimate shown in the product editor. */
export function calculateUnitProfit(
  p: { price: number; costPrice: number; shippingCost: number; otherCost: number; gstRate: number },
  s: Pick<ProfitSettings, "gstMode" | "claimInputTaxCredit" | "gatewayFeeBps">,
  method: PaymentMethod = "ONLINE",
) {
  const gst = s.gstMode === "REGISTERED" ? gstIncluded(p.price, p.gstRate) : 0;
  const itc = s.gstMode === "REGISTERED" && s.claimInputTaxCredit ? gstIncluded(p.costPrice, p.gstRate) : 0;
  const gateway = method === "ONLINE" ? bpsOf(p.price, s.gatewayFeeBps) : 0;
  const profit = p.price - gst - (p.costPrice - itc) - p.shippingCost - p.otherCost - gateway;
  const marginPct = p.price > 0 ? Math.round((profit / p.price) * 1000) / 10 : 0;
  return { gst, itc, gateway, profit, marginPct };
}
