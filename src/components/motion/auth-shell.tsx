import Link from "next/link";
import { ShieldCheck, Truck } from "lucide-react";
import { FlowLines } from "./flow-lines";
import { MorphCard } from "./morph-card";

export type AuthLook = "teal" | "gold";

/**
 * Full-screen dark-glass shell for sign-in / sign-up pages.
 * - "teal": the store's own colours (teal glass, saffron accent) — default for customers.
 * - "gold": black & gold with a yellow accent — used on the admin login, or for customers if chosen.
 */
export function AuthShell({
  look, title, accent, subtitle, children, footer, badge, trust = true,
}: {
  look: AuthLook;
  title: string;
  accent: string;
  subtitle: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  badge?: string;
  trust?: boolean;
}) {
  return (
    <div className="auth-dark relative isolate flex min-h-[calc(100dvh-4rem)] items-center justify-center overflow-hidden px-4 py-10" data-look={look}>
      <FlowLines palette={look} className="-z-10" />
      <div className="relative w-full max-w-md">
        <MorphCard>
          {/* Detached glass shards at the cut corners */}
          <div aria-hidden className="absolute -left-1 -top-1 size-16 glass [clip-path:polygon(0_0,100%_0,0_100%)] rounded-tl-2xl" />
          <div aria-hidden className="absolute -bottom-1 -right-1 size-16 glass [clip-path:polygon(100%_0,100%_100%,0_100%)] rounded-br-2xl" />
          <div className="glass cut-corners rounded-[1.6rem] px-6 pb-7 pt-9 shadow-[0_30px_80px_-20px_rgb(0_0_0_/_0.7)] sm:px-9">
            <div className="mb-5 flex items-center justify-between gap-3">
              <Link href="/" className="flex items-center gap-2" aria-label="Buyontime home">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/icon.svg" alt="" className="size-8" width={32} height={32} />
                <span className="text-base font-extrabold tracking-tight">Buy<span style={{ color: "var(--auth-accent)" }}>on</span>time</span>
              </Link>
              {badge && <span className="rounded-full border border-white/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-white/70">{badge}</span>}
            </div>
            <h1 className="animate-rise text-[1.75rem] font-extrabold leading-tight tracking-tight">
              {title} <span style={{ color: "var(--auth-accent)" }}>{accent}</span>
            </h1>
            <p className="animate-rise mb-6 mt-1.5 text-sm text-white/65 [animation-delay:60ms]">{subtitle}</p>
            <div className="animate-rise [animation-delay:120ms]">{children}</div>
            {footer && <div className="mt-6 border-t border-white/10 pt-5 text-center text-sm text-white/70">{footer}</div>}
          </div>
        </MorphCard>
        {trust && <p className="mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-white/60">
          <span className="inline-flex items-center gap-1.5"><ShieldCheck className="size-3.5" /> Secure payments by Razorpay</span>
          <span className="inline-flex items-center gap-1.5"><Truck className="size-3.5" /> Cash on Delivery available</span>
        </p>}
      </div>
    </div>
  );
}
