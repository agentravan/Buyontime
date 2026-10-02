import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { formatINR } from "@/lib/money";
import { getSettings } from "@/lib/settings";
import { Card } from "@/components/ui/card";
import { getWallet, type WalletReason } from "@/server/wallet";

export const metadata: Metadata = { title: "Wallet", robots: { index: false } };

const LABEL: Record<WalletReason, string> = {
  REFERRAL_GIFT: "Refer & earn gift",
  REFERRAL_BONUS: "Refer & earn bonus",
  ORDER_PAYMENT: "Paid towards an order",
  ORDER_REFUND: "Returned from a cancelled order",
  ADMIN_ADJUST: "Added or adjusted by the store",
};

export default async function WalletPage() {
  const user = await requireUser();
  const settings = await getSettings();
  const wallet = await getWallet(user.id, settings.walletMaxPercent);
  return (
    <div className="space-y-5">
      <div className="rounded-3xl bg-gradient-to-br from-brand-800 via-brand-700 to-brand-600 p-5 text-white sm:p-6">
        <p className="text-sm text-brand-100">Wallet balance</p>
        <p className="mt-1 text-4xl font-extrabold tracking-tight">{formatINR(wallet.balance)}</p>
        <p className="mt-2 text-sm text-brand-100">Tick &quot;Use wallet money&quot; at checkout. It pays up to {wallet.maxPercent}% of an order.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/products" className="rounded-xl bg-white px-4 py-2 text-sm font-bold text-brand-800 hover:bg-brand-50">Shop now</Link>
          {settings.referralEnabled && <Link href="/account/refer" className="rounded-xl bg-white/15 px-4 py-2 text-sm font-bold text-white hover:bg-white/25">Earn more: refer a friend</Link>}
        </div>
      </div>

      <Card className="p-4 sm:p-5">
        <h2 className="text-sm font-bold">Wallet history</h2>
        {wallet.entries.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Nothing here yet. Gifts you earn by referring friends are added to your wallet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {wallet.entries.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span>
                  <span className="font-medium">{LABEL[e.reason] ?? "Wallet update"}</span>
                  <span className="block text-xs text-muted">{e.note ? `${e.note} · ` : ""}{new Date(e.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })}</span>
                </span>
                <span className={e.amount >= 0 ? "font-extrabold text-emerald-700" : "font-extrabold text-ink"}>{e.amount >= 0 ? "+" : "−"}{formatINR(Math.abs(e.amount))}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <p className="text-xs text-muted">Wallet money can only be used on this store. It cannot be withdrawn, transferred or exchanged for cash. Money used on an order comes back to the wallet if that order is cancelled.</p>
    </div>
  );
}
