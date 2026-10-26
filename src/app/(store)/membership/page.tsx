import type { Metadata } from "next";
import Link from "next/link";
import { BadgeIndianRupee, Check, Crown, Gift, ShieldCheck } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { formatINR } from "@/lib/money";
import { PLAN_LABEL } from "@/lib/membership";
import { Card } from "@/components/ui/card";
import { MembershipBuyButton } from "@/components/store/membership-buy";
import { getMembershipView } from "@/server/membership";

export const metadata: Metadata = {
  title: "BuyOnTime Plus membership",
  description: "Member prices on every product and gift vouchers for regular shoppers. 6 months or 1 year.",
};

const date = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) : "";

export default async function MembershipPage() {
  const user = await getCurrentUser();
  const v = await getMembershipView(user?.role === "CUSTOMER" ? user.id : null);
  const [half, year] = v.plans;
  const perMonthYear = Math.round(year.price / 12 / 100) * 100;
  const voucherRange = v.rewardMin === v.rewardMax ? formatINR(v.rewardMin) : `${formatINR(v.rewardMin)}–${formatINR(v.rewardMax)}`;
  const toNext = v.rewardEvery > 0 ? v.rewardEvery - (v.deliveredThisMembership % v.rewardEvery) : 0;
  const done = v.rewardEvery > 0 ? v.deliveredThisMembership % v.rewardEvery : 0;

  return (
    <div className="container-page space-y-6 py-6">
      <section className="overflow-hidden rounded-3xl bg-[#0b1220] text-white">
        <div className="p-6 sm:p-8">
          <p className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-[#ffe08a]"><Crown className="size-3.5" /> BuyOnTime Plus</p>
          {v.isMember ? (
            <>
              <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">You&apos;re a Plus member.</h1>
              <p className="mt-2 text-slate-300">Member prices are applied to your cart automatically. Your membership runs until <b className="text-white">{date(v.memberUntil)}</b>.</p>
            </>
          ) : (
            <>
              <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">Pay less on every order.</h1>
              <p className="mt-2 max-w-xl text-slate-300">
                Plus members get a lower member price on products — up to {formatINR(v.memberProfitGap)} off each item — plus a gift voucher for regular shopping.
              </p>
            </>
          )}
        </div>
      </section>

      {!v.enabled && <Card className="p-4 text-sm text-muted">Membership is not open for new members right now.</Card>}

      {v.enabled && (
        <section className="grid gap-4 md:grid-cols-2">
          {[{ p: half, note: `${formatINR(Math.round(half.price / 6 / 100) * 100)} a month` }, { p: year, note: `Best value — about ${formatINR(perMonthYear)} a month`, best: true }].map(({ p, note, best }) => (
            <Card key={p.plan} className={best ? "relative p-5 ring-2 ring-[#c9971c]" : "p-5"}>
              {best && <span className="absolute -top-3 left-5 rounded-full bg-[#c9971c] px-3 py-0.5 text-xs font-bold text-white">Most popular</span>}
              <p className="text-sm font-semibold text-muted">{PLAN_LABEL[p.plan]}</p>
              <p className="mt-1 text-4xl font-extrabold tracking-tight">{formatINR(p.price)}</p>
              <p className="mt-1 text-sm text-muted">{note} · one-time payment, no auto-renewal</p>
              <ul className="mt-4 space-y-2 text-sm">
                <li className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-emerald-600" /> Member price on products marked with <Crown className="inline size-3.5 text-[#c9971c]" /></li>
                {v.rewardEvery > 0 && <li className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-emerald-600" /> {voucherRange} Amazon or Flipkart gift voucher for every {v.rewardEvery} delivered orders</li>}
                <li className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-emerald-600" /> Works with Cash on Delivery and online payment</li>
              </ul>
              <div className="mt-5">
                <MembershipBuyButton plan={p.plan} signedIn={Boolean(user)} highlight={best} label={v.isMember ? `Extend by ${PLAN_LABEL[p.plan]}` : `Join for ${formatINR(p.price)}`} />
              </div>
            </Card>
          ))}
        </section>
      )}

      {v.isMember && v.rewardEvery > 0 && (
        <Card className="p-5">
          <h2 className="flex items-center gap-2 font-bold"><Gift className="size-4 text-[#c9971c]" /> Your gift vouchers</h2>
          <div className="mt-3 flex items-center justify-between text-xs">
            <span className="font-semibold">Next voucher ({voucherRange})</span>
            <span className="text-muted">{done} of {v.rewardEvery} delivered orders</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label="Progress to next gift voucher" aria-valuemin={0} aria-valuemax={v.rewardEvery} aria-valuenow={done}>
            <div className="h-full rounded-full bg-gradient-to-r from-[#c9971c] to-[#f2c14e]" style={{ width: `${(done / v.rewardEvery) * 100}%` }} />
          </div>
          <p className="mt-1.5 text-xs text-muted">{toNext} more delivered order{toNext === 1 ? "" : "s"} to go. Only orders placed while you are a member count.</p>
          {v.rewards.length > 0 && (
            <ul className="mt-4 divide-y divide-line">
              {v.rewards.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                  <span><b>{formatINR(r.amount)}</b> {r.brand ?? "gift"} voucher <span className="text-muted">· for {r.milestone} delivered orders</span></span>
                  {r.status === "SENT" && r.code
                    ? <span className="rounded-lg bg-emerald-50 px-2.5 py-1 font-mono text-xs font-bold text-emerald-800">{r.code}</span>
                    : <span className="text-xs font-semibold text-saffron-600">On its way — we&apos;ll post the code here</span>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <section className="grid gap-3 sm:grid-cols-3">
        {[
          { icon: BadgeIndianRupee, t: "Real savings", d: "The member price is shown on each product. Checkout charges exactly that." },
          { icon: ShieldCheck, t: "Secure payment", d: "Pay once through Razorpay. Your membership switches on as soon as the payment is confirmed." },
          { icon: Gift, t: "Vouchers you can use anywhere", d: "Vouchers are sent as Amazon or Flipkart gift card codes, shown on this page." },
        ].map((x) => (
          <Card key={x.t} className="p-4">
            <x.icon className="size-5 text-brand-700" />
            <p className="mt-2 text-sm font-bold">{x.t}</p>
            <p className="mt-1 text-xs text-muted">{x.d}</p>
          </Card>
        ))}
      </section>

      <Card className="p-5 text-xs leading-relaxed text-muted">
        <h2 className="mb-2 text-sm font-bold text-ink">Membership terms</h2>
        <ul className="list-disc space-y-1 pl-4">
          <li>Membership starts when your payment is confirmed. Buying again while you are a member adds the new period to the end of the current one.</li>
          <li>Member prices apply to orders placed while your membership is active, on products that show a member price.</li>
          <li>Gift vouchers are earned on delivered orders placed during the membership. Orders that are cancelled, returned or not accepted on delivery do not count.</li>
          <li>Membership fees are not refundable once member prices have been used on an order. For any question, see <Link href="/policies/contact" className="font-semibold text-brand-700">Contact us</Link>.</li>
        </ul>
      </Card>

      {v.history.length > 0 && (
        <Card className="p-5">
          <h2 className="text-sm font-bold">Your memberships</h2>
          <ul className="mt-2 divide-y divide-line text-sm">
            {v.history.map((h) => (
              <li key={h.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span>{PLAN_LABEL[h.plan]} · {formatINR(h.amount)}</span>
                <span className="text-muted">{h.status === "CANCELLED" ? "Cancelled" : `${date(h.startsAt)} – ${date(h.endsAt)}`}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
