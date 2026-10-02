import Link from "next/link";
import { Gem, Gift, RotateCw, Users, Wallet } from "lucide-react";
import { formatINR } from "@/lib/money";

export type CircleData = {
  delivered: number;
  spinsLeft: number;
  spinsPerOrder: number;
  walletBalance: number;
  friends: number;
  /** 0 when the store is not running the gift-voucher reward. */
  voucherEvery: number;
  voucherAmount: number;
  voucherToGo: number;
  referralEnabled: boolean;
};

/**
 * "BuyOnTime Circle": the member's real benefits in one place. Everything shown here is something the
 * store actually gives — spins with each order, wallet gifts for referrals, and the voucher reward.
 */
export function CircleCard({ data }: { data: CircleData }) {
  const done = data.voucherEvery > 0 ? data.voucherEvery - data.voucherToGo : 0;
  return (
    <section className="overflow-hidden rounded-3xl bg-[#0b1220] text-white">
      <div className="p-5 sm:p-6">
        <p className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-[#ffe08a]"><Gem className="size-3.5" /> BuyOnTime Circle</p>
        <h2 className="mt-3 text-2xl font-extrabold tracking-tight">You&apos;re part of the Circle.</h2>
        <p className="mt-1 text-sm text-slate-300">Shop → Earn → Unlock → Enjoy. Your next reward is one order away: {data.spinsPerOrder} spin{data.spinsPerOrder === 1 ? "" : "s"} with every order.</p>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Link href="/?spin=1" className="rounded-2xl bg-white/10 p-3 hover:bg-white/15">
            <RotateCw className="size-4 text-[#ffe08a]" />
            <p className="mt-1.5 text-xl font-extrabold leading-none">{data.spinsLeft}</p>
            <p className="mt-0.5 text-[11px] text-slate-300">Spins waiting</p>
          </Link>
          <Link href="/account/wallet" className="rounded-2xl bg-white/10 p-3 hover:bg-white/15">
            <Wallet className="size-4 text-[#ffe08a]" />
            <p className="mt-1.5 text-xl font-extrabold leading-none">{formatINR(data.walletBalance)}</p>
            <p className="mt-0.5 text-[11px] text-slate-300">Wallet</p>
          </Link>
          <Link href="/account/orders" className="rounded-2xl bg-white/10 p-3 hover:bg-white/15">
            <Gift className="size-4 text-[#ffe08a]" />
            <p className="mt-1.5 text-xl font-extrabold leading-none">{data.delivered}</p>
            <p className="mt-0.5 text-[11px] text-slate-300">Orders delivered</p>
          </Link>
          {data.referralEnabled && (
            <Link href="/account/refer" className="rounded-2xl bg-white/10 p-3 hover:bg-white/15">
              <Users className="size-4 text-[#ffe08a]" />
              <p className="mt-1.5 text-xl font-extrabold leading-none">{data.friends}</p>
              <p className="mt-0.5 text-[11px] text-slate-300">Friends referred</p>
            </Link>
          )}
        </div>

        {data.voucherEvery > 0 && (
          <div className="mt-4 rounded-2xl bg-white/5 p-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-200">{formatINR(data.voucherAmount)} Amazon voucher</span>
              <span className="text-slate-300">{done} of {data.voucherEvery} delivered orders</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-label="Progress to gift voucher" aria-valuemin={0} aria-valuemax={data.voucherEvery} aria-valuenow={done}>
              <div className="h-full rounded-full bg-gradient-to-r from-[#f2c14e] to-[#ffe9a6]" style={{ width: `${(done / data.voucherEvery) * 100}%` }} />
            </div>
            <p className="mt-1.5 text-xs text-slate-300">{data.voucherToGo} more delivered order{data.voucherToGo === 1 ? "" : "s"} to unlock it.</p>
          </div>
        )}
      </div>
    </section>
  );
}
