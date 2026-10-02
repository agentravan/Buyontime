import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { formatINR } from "@/lib/money";
import { Card, EmptyState } from "@/components/ui/card";
import { SpinWheel } from "@/components/store/spin-wheel";
import { getSpinState } from "@/server/spin";
import { Gift } from "lucide-react";

export const metadata: Metadata = { title: "Spin & Win", description: "One spin per account — win a discount or free delivery on your order." };
export const dynamic = "force-dynamic";

export default async function SpinPage() {
  const user = await getCurrentUser();
  const state = await getSpinState(user);

  if (!state.enabled) {
    return (
      <div className="container-page py-10">
        <EmptyState icon={<Gift />} title="Spin & Win is not running right now" description="Check back soon — meanwhile, have a look at today's deals." action={<Link href="/products?onSale=1" className="rounded-xl bg-brand-700 px-5 py-2.5 text-sm font-semibold text-white">See deals</Link>} />
      </div>
    );
  }

  const { minOrder, maxDiscount, validDays } = state.terms;
  return (
    <div className="container-page max-w-3xl py-6">
      <h1 className="text-2xl font-extrabold tracking-tight">Spin &amp; Win</h1>
      <p className="mt-1 text-sm text-muted">
        {state.creator ? "A thank-you for our partner creators." : "One spin per account. Every spin wins — there are no empty slots."}
      </p>

      <Card className="mt-5 p-4 sm:p-6">
        <SpinWheel segments={state.segments} signedIn={state.signedIn} creator={state.creator} initialOutcome={state.outcome} />
      </Card>

      {!state.creator && (
        <Card className="mt-4 p-4 text-sm sm:p-5">
          <h2 className="font-bold">Your chances</h2>
          <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {state.segments.map((s) => (
              <li key={s.prize} className="flex justify-between rounded-lg bg-slate-50 px-3 py-1.5">
                <span>{s.label}</span>
                <span className="font-semibold">{s.chancePct}%</span>
              </li>
            ))}
          </ul>
          <h2 className="mt-4 font-bold">How it works</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
            <li>The result is picked at random on our server with the chances shown above.</li>
            <li>You get a personal coupon code. Enter it at checkout — it works once, only on your account, for {validDays} days.</li>
            <li>
              Percentage coupons{minOrder > 0 ? <> need an order of {formatINR(minOrder)} or more</> : <> work on any order</>}
              {maxDiscount > 0 ? <> and take off up to {formatINR(maxDiscount)}</> : null}. The free-delivery coupon works on any order.
            </li>
            <li>One coupon per order. Coupons cannot be exchanged for cash.</li>
          </ul>
        </Card>
      )}
    </div>
  );
}
