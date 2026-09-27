import type { OrderStatus, PaymentMethod, PaymentStatus, ReturnStatus } from "@prisma/client";

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "Awaiting payment",
  CONFIRMED: "Confirmed",
  PROCESSING: "Processing",
  SHIPPED: "Shipped",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
  RTO: "Returned to origin",
  RETURN_REQUESTED: "Return requested",
  RETURNED: "Returned",
};

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  PENDING: "Payment pending",
  AUTHORIZED: "Payment authorized",
  PAID: "Payment received",
  FAILED: "Payment failed",
  CANCELLED: "Payment cancelled",
  REFUND_PENDING: "Refund processing",
  REFUNDED: "Refunded",
  PARTIALLY_REFUNDED: "Partially refunded",
};

/** Customer-facing wording for payment state. */
export const CUSTOMER_PAYMENT_LABEL: Record<PaymentStatus, string> = {
  PENDING: "Payment Pending",
  AUTHORIZED: "Payment Processing",
  PAID: "Payment Successful",
  FAILED: "Payment Failed — Try Again",
  CANCELLED: "Payment Cancelled",
  REFUND_PENDING: "Refund Processing",
  REFUNDED: "Refund Completed",
  PARTIALLY_REFUNDED: "Partial Refund Completed",
};

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  ONLINE: "Online (Razorpay)",
  COD: "Cash on Delivery",
};

export const RETURN_STATUS_LABEL: Record<ReturnStatus, string> = {
  REQUESTED: "Return requested",
  APPROVED: "Return approved",
  REJECTED: "Return rejected",
  RECEIVED: "Returned",
  REFUND_INITIATED: "Refund initiated",
  REFUNDED: "Refunded",
};

export type Tone = "green" | "yellow" | "red" | "blue" | "gray" | "purple" | "orange";

export function paymentTone(s: PaymentStatus): Tone {
  switch (s) {
    case "PAID": return "green";
    case "PENDING":
    case "AUTHORIZED": return "yellow";
    case "FAILED":
    case "CANCELLED": return "red";
    case "REFUND_PENDING": return "purple";
    case "REFUNDED":
    case "PARTIALLY_REFUNDED": return "blue";
  }
}

export function orderTone(s: OrderStatus): Tone {
  switch (s) {
    case "DELIVERED": return "green";
    case "PENDING_PAYMENT": return "yellow";
    case "CANCELLED":
    case "RTO": return "red";
    case "RETURN_REQUESTED":
    case "RETURNED": return "orange";
    case "SHIPPED":
    case "OUT_FOR_DELIVERY": return "purple";
    default: return "blue";
  }
}

/** Allowed admin status transitions (the order state machine). */
export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING_PAYMENT: ["CANCELLED"],
  CONFIRMED: ["PROCESSING", "SHIPPED", "CANCELLED"],
  PROCESSING: ["SHIPPED", "CANCELLED"],
  SHIPPED: ["OUT_FOR_DELIVERY", "DELIVERED", "RTO"],
  OUT_FOR_DELIVERY: ["DELIVERED", "RTO"],
  DELIVERED: [],
  CANCELLED: [],
  RTO: [],
  RETURN_REQUESTED: [],
  RETURNED: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from].includes(to);
}

export const CUSTOMER_CANCELLABLE: OrderStatus[] = ["PENDING_PAYMENT", "CONFIRMED", "PROCESSING"];

export type TimelineStep = { key: string; label: string; done: boolean; current: boolean; at?: Date | null };

const FLOW: { key: OrderStatus | "PLACED" | "PAID"; label: string }[] = [
  { key: "PLACED", label: "Order Placed" },
  { key: "PAID", label: "Payment Confirmed" },
  { key: "CONFIRMED", label: "Order Confirmed" },
  { key: "PROCESSING", label: "Processing" },
  { key: "SHIPPED", label: "Shipped" },
  { key: "OUT_FOR_DELIVERY", label: "Out for Delivery" },
  { key: "DELIVERED", label: "Delivered" },
];

const RANK: Partial<Record<OrderStatus, number>> = {
  PENDING_PAYMENT: 0, CONFIRMED: 2, PROCESSING: 3, SHIPPED: 4, OUT_FOR_DELIVERY: 5, DELIVERED: 6,
  RETURN_REQUESTED: 6, RETURNED: 6,
};

/** Builds the customer-facing progress timeline. COD orders show "Pay on delivery" instead of payment confirmation. */
export function buildTimeline(order: {
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  createdAt: Date;
  paidAt: Date | null;
  confirmedAt: Date | null;
  deliveredAt: Date | null;
  shippedAt?: Date | null;
}): TimelineStep[] {
  const rank = RANK[order.status] ?? 0;
  const paid = ["PAID", "REFUND_PENDING", "REFUNDED", "PARTIALLY_REFUNDED"].includes(order.paymentStatus);
  return FLOW.map((step, idx) => {
    let done: boolean;
    let label = step.label;
    let at: Date | null | undefined;
    if (step.key === "PLACED") { done = true; at = order.createdAt; }
    else if (step.key === "PAID") {
      if (order.paymentMethod === "COD") {
        label = paid ? "Cash Collected" : "Pay on Delivery";
        done = paid || rank >= 2;
      } else done = paid;
      at = order.paidAt;
    } else {
      done = rank >= idx;
      if (step.key === "CONFIRMED") at = order.confirmedAt;
      if (step.key === "SHIPPED") at = order.shippedAt;
      if (step.key === "DELIVERED") at = order.deliveredAt;
    }
    return { key: step.key, label, done, current: false, at };
  }).map((s, i, arr) => ({ ...s, current: s.done && (i === arr.length - 1 || !arr[i + 1].done) }));
}
