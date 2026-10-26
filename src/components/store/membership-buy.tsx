"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { loadRazorpay } from "@/components/store/razorpay";

type Params = {
  keyId: string;
  razorpayOrderId: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  prefill: { name: string; email: string; contact: string };
};

async function post<T>(url: string, body: unknown): Promise<{ ok: boolean; data: T & { error?: string } }> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as T & { ok?: boolean; error?: string };
  return { ok: res.ok && data.ok !== false, data };
}

/**
 * "Join" button for a BuyOnTime Plus plan. Opens Razorpay Checkout; the membership is switched on only
 * after the server has verified the payment (the webhook also confirms it if this tab is closed).
 */
export function MembershipBuyButton({ plan, label, signedIn, highlight }: { plan: "HALF_YEAR" | "YEAR"; label: string; signedIn: boolean; highlight?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function buy() {
    if (!signedIn) {
      router.push(`/login?next=${encodeURIComponent("/membership")}`);
      return;
    }
    setBusy(true);
    const started = await post<Params>("/api/membership/order", { plan });
    if (!started.ok) {
      setBusy(false);
      toast.error(started.data.error ?? "Could not start the payment. Please try again.");
      return;
    }
    const loaded = await loadRazorpay();
    if (!loaded || !window.Razorpay) {
      setBusy(false);
      toast.error("Could not load the payment window. Check your connection and try again.");
      return;
    }
    const p = started.data;
    const rzp = new window.Razorpay({
      key: p.keyId,
      amount: p.amount,
      currency: p.currency,
      name: p.name,
      description: p.description,
      order_id: p.razorpayOrderId,
      prefill: p.prefill,
      theme: { color: "#0c655c" },
      handler: async (r: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
        const v = await post<{ active: boolean }>("/api/membership/verify", r);
        setBusy(false);
        if (v.ok && v.data.active) toast.success("Welcome to BuyOnTime Plus! Member prices are now on.");
        else if (v.ok) toast.message("Payment received. Your membership will switch on in a minute.");
        else toast.error(v.data.error ?? "We could not verify the payment. If money was deducted it will be confirmed automatically.");
        router.refresh();
      },
      modal: { ondismiss: () => setBusy(false) },
    });
    rzp.on("payment.failed", () => {
      toast.error("Payment failed. No membership was charged — please try again.");
    });
    rzp.open();
  }

  return (
    <Button size="lg" variant={highlight ? "accent" : "outline"} className="w-full" loading={busy} onClick={buy}>
      {label}
    </Button>
  );
}
