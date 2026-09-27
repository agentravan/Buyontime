import type { MixedCartPolicy, PaymentMethod, PaymentOption } from "@prisma/client";

/**
 * Decides which payment methods a customer may use for a given set of items.
 * Inputs: store settings + product payment configuration + customer restrictions + pincode + order value.
 * The checkout UI and the server-side order placement BOTH call this, so the server never
 * accepts a method the UI would not show.
 */

export type PaymentRuleSettings = {
  onlinePaymentEnabled: boolean;
  codEnabled: boolean;
  codMaxOrderValue: number | null;
  codMinOrderValue: number;
  codBlockedPincodes: string[];
  mixedCartPolicy: MixedCartPolicy;
};

export type PaymentRuleItem = { productId: string; name: string; paymentOption: PaymentOption };

export type MethodVerdict = { allowed: boolean; reason?: string };

export type PaymentAvailability = {
  online: MethodVerdict;
  cod: MethodVerdict;
  methods: PaymentMethod[];
  /** True when the items have no payment method in common because of product-level rules. */
  conflict: boolean;
  policy: MixedCartPolicy;
  /** Product ids that can be checked out together for each method (used to split the cart). */
  groups: { ONLINE: string[]; COD: string[] };
  message?: string;
};

export const CONFLICT_MESSAGE =
  "Some products in your cart have different payment requirements. Please place separate orders.";

export function productAllows(option: PaymentOption, method: PaymentMethod): boolean {
  if (option === "ONLINE_AND_COD") return true;
  return method === "ONLINE" ? option === "ONLINE_ONLY" : option === "COD_ONLY";
}

export function paymentOptionLabel(option: PaymentOption): string {
  return option === "ONLINE_ONLY" ? "Online only" : option === "COD_ONLY" ? "COD only" : "Online + COD";
}

export function resolvePaymentMethods(input: {
  settings: PaymentRuleSettings;
  gatewayConfigured: boolean;
  items: PaymentRuleItem[];
  customer?: { codBlocked: boolean } | null;
  pincode?: string | null;
  orderTotal?: number;
}): PaymentAvailability {
  const { settings, items } = input;
  const groups = {
    ONLINE: items.filter((i) => productAllows(i.paymentOption, "ONLINE")).map((i) => i.productId),
    COD: items.filter((i) => productAllows(i.paymentOption, "COD")).map((i) => i.productId),
  };

  const productsAllowOnline = items.length > 0 && groups.ONLINE.length === items.length;
  const productsAllowCod = items.length > 0 && groups.COD.length === items.length;
  const conflict = items.length > 1 && !productsAllowOnline && !productsAllowCod;

  let online: MethodVerdict;
  if (!productsAllowOnline) {
    const blocker = items.find((i) => !productAllows(i.paymentOption, "ONLINE"));
    online = { allowed: false, reason: blocker ? `${blocker.name} is available on Cash on Delivery only` : "No items" };
  } else if (!settings.onlinePaymentEnabled) {
    online = { allowed: false, reason: "Online payment is currently unavailable" };
  } else if (!input.gatewayConfigured) {
    online = { allowed: false, reason: "Online payment is not configured yet" };
  } else {
    online = { allowed: true };
  }

  let cod: MethodVerdict;
  const pin = input.pincode?.trim();
  if (!productsAllowCod) {
    const blocker = items.find((i) => !productAllows(i.paymentOption, "COD"));
    cod = { allowed: false, reason: blocker ? `${blocker.name} requires online payment` : "No items" };
  } else if (!settings.codEnabled) {
    cod = { allowed: false, reason: "Cash on Delivery is currently unavailable" };
  } else if (input.customer?.codBlocked) {
    cod = { allowed: false, reason: "Cash on Delivery is not available for this account" };
  } else if (pin && settings.codBlockedPincodes.includes(pin)) {
    cod = { allowed: false, reason: `Cash on Delivery is not available for pincode ${pin}` };
  } else if (input.orderTotal !== undefined && settings.codMaxOrderValue && input.orderTotal > settings.codMaxOrderValue) {
    cod = { allowed: false, reason: "Order value exceeds the Cash on Delivery limit" };
  } else if (input.orderTotal !== undefined && settings.codMinOrderValue > 0 && input.orderTotal < settings.codMinOrderValue) {
    cod = { allowed: false, reason: "Order value is below the Cash on Delivery minimum" };
  } else {
    cod = { allowed: true };
  }

  const methods: PaymentMethod[] = [];
  if (online.allowed) methods.push("ONLINE");
  if (cod.allowed) methods.push("COD");

  let message: string | undefined;
  if (conflict) message = CONFLICT_MESSAGE;
  else if (items.length > 0 && methods.length === 0) message = "No payment method is currently available for these items.";

  return { online, cod, methods, conflict, policy: settings.mixedCartPolicy, groups, message };
}
