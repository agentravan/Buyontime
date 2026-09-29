import { BadgeCheck, RotateCcw, ShieldCheck, Sparkles, Truck, Wallet } from "lucide-react";
import type { StoreSettings } from "@prisma/client";
import { formatINR } from "@/lib/money";

type Item = { icon: React.ComponentType<{ className?: string }>; text: string };

/**
 * Brand announcement bar: the store's promise first, then live facts from settings (free-delivery
 * threshold, COD, returns). SITE_NOTICE (Vercel env) replaces the opening line; "|" separates extra lines.
 * Scrolls gently like a ticker; shows a static line for people who turn motion off.
 */
export function AnnouncementBar({ settings }: { settings: StoreSettings }) {
  const custom = (process.env.SITE_NOTICE ?? "").split("|").map((s) => s.trim()).filter(Boolean);
  const items: Item[] = [
    ...(custom.length ? custom.map((text) => ({ icon: Sparkles, text })) : [{ icon: Sparkles, text: "Handpicked quality · Honest prices · Delivered on time" }]),
    ...(settings.freeShippingThreshold > 0 ? [{ icon: Truck, text: `Free delivery on orders above ${formatINR(settings.freeShippingThreshold)}` }] : [{ icon: Truck, text: "Free delivery on every order" }]),
    ...(settings.codEnabled ? [{ icon: Wallet, text: "Cash on Delivery available" }] : []),
    ...(settings.returnWindowDays > 0 ? [{ icon: RotateCcw, text: `Easy ${settings.returnWindowDays}-day returns` }] : []),
    { icon: ShieldCheck, text: "100% secure payments" },
    { icon: BadgeCheck, text: "Every order quality-checked before dispatch" },
  ];
  const row = (hidden: boolean) => (
    <ul className="flex shrink-0 items-center" aria-hidden={hidden || undefined}>
      {items.map((it, i) => (
        <li key={i} className="flex items-center gap-1.5 whitespace-nowrap px-5 text-xs font-semibold sm:text-[13px]">
          <it.icon className="size-3.5 text-saffron-300" /> {it.text}
          <span aria-hidden className="ml-5 size-1 rounded-full bg-white/35" />
        </li>
      ))}
    </ul>
  );
  return (
    <div className="relative overflow-hidden bg-gradient-to-r from-brand-900 via-brand-700 to-brand-900 py-2 text-white" aria-label="Store highlights">
      <div className="flex w-max animate-[ticker_40s_linear_infinite] hover:[animation-play-state:paused]">
        {row(false)}
        {row(true)}
      </div>
      <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-brand-900 to-transparent" />
      <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-brand-900 to-transparent" />
    </div>
  );
}
