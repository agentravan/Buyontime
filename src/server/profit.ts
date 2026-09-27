import "server-only";
import type { Order, OrderItem, Payment, Prisma, Refund, ReturnItem, ReturnRequest, ShippingInformation, StoreSettings } from "@prisma/client";
import { calculateOrderProfit, type ProfitResult } from "@/lib/profit";

export const profitInclude = {
  items: true,
  payments: true,
  refunds: true,
  shipment: true,
  returns: { include: { items: true } },
} satisfies Prisma.OrderInclude;

type OrderForProfit = Order & {
  items: OrderItem[];
  payments: Payment[];
  refunds: Refund[];
  shipment: ShippingInformation | null;
  returns: (ReturnRequest & { items: ReturnItem[] })[];
};

/** Maps a stored order onto the pure profit engine. */
export function orderProfit(order: OrderForProfit, settings: StoreSettings): ProfitResult {
  const recovered = new Map<string, number>();
  for (const r of order.returns) {
    for (const ri of r.items) {
      if (ri.condition === "RESELLABLE" || ri.condition === "RETURN_TO_SUPPLIER") {
        recovered.set(ri.orderItemId, (recovered.get(ri.orderItemId) ?? 0) + ri.quantity);
      }
    }
  }
  const paid = order.payments.find((p) => p.method === "ONLINE" && p.gatewayFee !== null && ["PAID", "REFUND_PENDING", "REFUNDED", "PARTIALLY_REFUNDED"].includes(p.status));
  return calculateOrderProfit(
    {
      status: order.status,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      total: order.total,
      gstAmount: order.gstAmount,
      items: order.items.map((i) => ({
        quantity: i.quantity,
        recoveredQuantity: recovered.get(i.id) ?? 0,
        unitCost: i.unitCost,
        unitShippingCost: i.unitShippingCost,
        unitOtherCost: i.unitOtherCost,
        gstRate: i.gstRate,
      })),
      refunded: order.refunds.filter((r) => r.status === "PROCESSED").reduce((s, r) => s + r.amount, 0),
      gatewayFeeActual: paid?.gatewayFee ?? null,
      shippingActual: order.shipment?.actualCost ?? null,
      returnShippingActual: order.shipment?.returnCost ?? null,
    },
    settings,
  );
}
