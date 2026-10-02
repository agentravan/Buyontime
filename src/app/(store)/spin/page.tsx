import type { Metadata } from "next";
import Link from "next/link";
import { Gift } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { formatINR } from "@/lib/money";
import { Card, EmptyState } from "@/components/ui/card";
import { SpinWheel } from "@/components/store/spin-wheel";
import { getSpinState } from "@/server/spin";

export const metadata: Metadata = { title: "Spin & Win", description: "Spin for a discount or free delivery — one free spin, then a new spin with every order." };
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
      <p className="mt-1 text-sm text-muted">One free spin for every account, then a new spin with every order. Every spin wins — there are no empty slots.</p>

      <Card className="mt-5 p-4 sm:p-6">
        <SpinWheel segments={state.segments} signedIn={state.signedIn} canSpin={state.canSpin} granted={state.granted} results={state.results} />
      </Card>

      {!state.granted && (
        <Card className="mt-4 p-4 text-sm sm:p-5">
          <h2 className="font-bold">Your chances on this wheel</h2>
          <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {state.segments.map((s) => (
              <li key={s.prize} className="flex justify-between rounded-lg bg-slate-50 px-3 py-1.5">
                <span>{s.label}</span>
                <span className="font-semibold">{s.chancePct}%</span>
              </li>
            ))}
          </ul>
          {state.voucherNote && <p className="mt-2 rounded-lg bg-saffron-50 px-3 py-2 text-xs text-ink">{state.voucherNote}</p>}
          <h2 className="mt-4 font-bold">How it works</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
            <li>The result is picked at random on our server with the chances shown above.</li>
            <li>A discount you win becomes your deal: prices across the store show it and it is applied automatically at checkout. It works once, only on your account, for {validDays} days.</li>
            <li>
              Percentage deals{minOrder > 0 ? <> need an order of {formatINR(minOrder)} or more</> : <> work on any order</>}
              {maxDiscount > 0 ? <> and take off up to {formatINR(maxDiscount)}</> : null}. Free delivery works on any order.
            </li>
            <li>Your deal ends when you place an order with it. Each order earns a new spin — right after an online payment, or on delivery for Cash on Delivery. Cancelled and returned orders do not count.</li>
            <li>Gift vouchers, when on the wheel, are sent as a code on this page. Deals and vouchers cannot be exchanged for cash.</li>
          </ul>
        </Card>
      )}
    </div>
  );
}
