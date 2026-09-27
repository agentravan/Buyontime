import Link from "next/link";
import { BadgeCheck, RotateCcw, ShieldCheck, Truck } from "lucide-react";
import type { StoreSettings } from "@prisma/client";
import { Logo } from "./header";

export function TrustStrip() {
  const items = [
    { icon: Truck, title: "On-time delivery", text: "Tracked shipping across India" },
    { icon: ShieldCheck, title: "Secure payments", text: "UPI, cards & netbanking via Razorpay" },
    { icon: RotateCcw, title: "Easy returns", text: "Hassle-free return requests" },
    { icon: BadgeCheck, title: "Quality checked", text: "Every order inspected before dispatch" },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map((i) => (
        <div key={i.title} className="flex items-start gap-3 rounded-2xl border border-line bg-white p-3 sm:p-4">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700"><i.icon className="size-5" /></span>
          <div>
            <p className="text-sm font-bold">{i.title}</p>
            <p className="text-xs text-muted">{i.text}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export function StoreFooter({ settings, categories }: { settings: StoreSettings; categories: { name: string; slug: string }[] }) {
  return (
    <footer className="mt-12 border-t border-line bg-white pb-20 md:pb-0">
      <div className="container-page grid gap-8 py-10 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-3">
          <Logo name={settings.storeName} />
          <p className="text-sm text-muted">{settings.tagline}</p>
          <p className="text-sm text-muted">{settings.contactEmail}{settings.contactPhone ? ` · ${settings.contactPhone}` : ""}</p>
        </div>
        <div>
          <h3 className="mb-3 text-sm font-bold">Shop</h3>
          <ul className="space-y-2 text-sm text-muted">
            {categories.slice(0, 6).map((c) => <li key={c.slug}><Link className="hover:text-brand-700" href={`/products?category=${c.slug}`}>{c.name}</Link></li>)}
            <li><Link className="hover:text-brand-700" href="/products?onSale=1">Deals</Link></li>
          </ul>
        </div>
        <div>
          <h3 className="mb-3 text-sm font-bold">Help</h3>
          <ul className="space-y-2 text-sm text-muted">
            <li><Link className="hover:text-brand-700" href="/account/orders">Track your order</Link></li>
            <li><Link className="hover:text-brand-700" href="/policies/shipping">Shipping policy</Link></li>
            <li><Link className="hover:text-brand-700" href="/policies/returns">Returns & refunds</Link></li>
            <li><Link className="hover:text-brand-700" href="/policies/contact">Contact us</Link></li>
          </ul>
        </div>
        <div>
          <h3 className="mb-3 text-sm font-bold">Legal</h3>
          <ul className="space-y-2 text-sm text-muted">
            <li><Link className="hover:text-brand-700" href="/policies/terms">Terms of use</Link></li>
            <li><Link className="hover:text-brand-700" href="/policies/privacy">Privacy policy</Link></li>
            <li><Link className="hover:text-brand-700" href="/policies/grievance">Grievance redressal</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-line py-4 text-center text-xs text-muted">
        © {new Date().getFullYear()} {settings.legalName || settings.storeName}. {settings.gstin ? `GSTIN ${settings.gstin}. ` : ""}All prices include GST where applicable.
      </div>
    </footer>
  );
}
