export const CUSTOMER_EVENTS = [
  "ORDER_CREATED",
  "PAYMENT_SUCCESS",
  "PAYMENT_FAILED",
  "ORDER_CONFIRMED",
  "ORDER_PROCESSING",
  "ORDER_SHIPPED",
  "OUT_FOR_DELIVERY",
  "ORDER_DELIVERED",
  "ORDER_CANCELLED",
  "RETURN_REQUESTED",
  "REFUND_INITIATED",
  "REFUND_COMPLETED",
] as const;

export const ACCOUNT_EVENTS = ["WELCOME", "PASSWORD_RESET"] as const;

export const ADMIN_EVENTS = [
  "ADMIN_NEW_ORDER",
  "ADMIN_COD_ORDER",
  "ADMIN_PAYMENT_RECEIVED",
  "ADMIN_PAYMENT_FAILED",
  "ADMIN_LOW_STOCK",
  "ADMIN_RETURN_REQUEST",
  "ADMIN_REFUND_UPDATE",
  "ADMIN_COMPLAINT",
  "ADMIN_ATTENTION",
] as const;

export type CustomerEvent = (typeof CUSTOMER_EVENTS)[number];
export type AccountEvent = (typeof ACCOUNT_EVENTS)[number];
export type AdminEvent = (typeof ADMIN_EVENTS)[number];
export type NotificationEvent = CustomerEvent | AccountEvent | AdminEvent;

/** Maps an order status to the customer event it should trigger. */
export const STATUS_EVENT: Partial<Record<string, CustomerEvent>> = {
  CONFIRMED: "ORDER_CONFIRMED",
  PROCESSING: "ORDER_PROCESSING",
  SHIPPED: "ORDER_SHIPPED",
  OUT_FOR_DELIVERY: "OUT_FOR_DELIVERY",
  DELIVERED: "ORDER_DELIVERED",
  CANCELLED: "ORDER_CANCELLED",
};
