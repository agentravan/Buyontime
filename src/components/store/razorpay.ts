"use client";

import type { RazorpayCheckoutParams } from "@/server/orders";

type RzpSuccess = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };
type RzpFailure = { error?: { description?: string; metadata?: { order_id?: string; payment_id?: string } } };

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void; on: (event: string, cb: (r: RzpFailure) => void) => void };
  }
}

let loader: Promise<boolean> | null = null;

export function loadRazorpay(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.Razorpay) return Promise.resolve(true);
  loader ??= new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.async = true;
    s.onload = () => resolve(true);
    s.onerror = () => { loader = null; resolve(false); };
    document.body.appendChild(s);
  });
  return loader;
}

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; orderNumber?: string; paymentStatus?: string };
  return { ok: res.ok && data.ok !== false, data };
}

/**
 * Opens Razorpay Checkout. The browser result is only a hint: on success we send the signature to the
 * server, which verifies it and re-fetches the payment from Razorpay before marking anything as paid.
 */
export async function payWithRazorpay(
  params: RazorpayCheckoutParams,
  handlers: { onVerified: (orderNumber: string) => void; onFailed: (message: string) => void; onDismiss: () => void },
) {
  const ok = await loadRazorpay();
  if (!ok || !window.Razorpay) {
    handlers.onFailed("Could not load the payment window. Check your connection and try again.");
    return;
  }
  // The failure report must reach the server before we navigate, so the order page shows the right state.
  let failureReport: Promise<unknown> | null = null;
  let failed = false;
  const rzp = new window.Razorpay({
    key: params.keyId,
    amount: params.amount,
    currency: params.currency,
    name: params.name,
    description: params.description,
    order_id: params.razorpayOrderId,
    prefill: params.prefill,
    theme: { color: "#0c655c" },
    retry: { enabled: true, max_count: 3 },
    handler: async (r: RzpSuccess) => {
      const res = await post("/api/payments/razorpay/verify", r);
      if (res.ok && res.data.orderNumber) handlers.onVerified(res.data.orderNumber);
      else handlers.onFailed(res.data.error ?? "We could not verify the payment. If money was deducted it will be confirmed automatically.");
    },
    modal: {
      ondismiss: async () => {
        if (failureReport) await failureReport.catch(() => undefined);
        if (failed) handlers.onFailed("Payment failed. You can retry from your order page.");
        else handlers.onDismiss();
      },
      confirm_close: true,
    },
  });
  rzp.on("payment.failed", (r: RzpFailure) => {
    failed = true;
    failureReport = post("/api/payments/razorpay/failed", {
      razorpay_order_id: params.razorpayOrderId,
      razorpay_payment_id: r.error?.metadata?.payment_id,
      description: r.error?.description,
    });
  });
  rzp.open();
}
