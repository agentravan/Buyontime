import Link from "next/link";
import { Bell, Gift, Heart, MapPin, Package } from "lucide-react";
import type { Order, OrderItem } from "@prisma/client";
import { formatINR } from "@/lib/money";
import { CUSTOMER_PAYMENT_LABEL } from "@/lib/order-status";
import { formatDate } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { OrderStatusBadge, PaymentStatusBadge } from "@/components/status";
import { ProductImage } from "@/components/product-image";

export function OrderCard({ order }: { order: Order & { items: OrderItem[] } }) {
  const first = order.items[0];
  return (
    <Link href={`/account/orders/${order.orderNumber}`} className="block">
      <Card className="flex gap-3 p-3 transition hover:shadow-lift sm:gap-4 sm:p-4">
        <div className="relative size-20 shrink-0 overflow-hidden rounded-xl bg-slate-50">
          <ProductImage src={first?.imageUrl} alt={first?.name ?? "Order"} sizes="80px" />
          {order.items.length > 1 && <span className="absolute bottom-1 right-1 rounded bg-slate-900/70 px-1 text-[10px] font-bold text-white">+{order.items.length - 1}</span>}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <OrderStatusBadge status={order.status} />
            <PaymentStatusBadge status={order.paymentStatus} label={order.paymentMethod === "COD" && order.paymentStatus === "PENDING" ? "Pay on delivery" : CUSTOMER_PAYMENT_LABEL[order.paymentStatus]} />
          </div>
          <p className="mt-1.5 line-clamp-1 text-sm font-semibold">{first?.name}{order.items.length > 1 ? ` and ${order.items.length - 1} more` : ""}</p>
          <p className="text-xs text-muted">{order.orderNumber} · {formatDate(order.createdAt)} · {order.paymentMethod === "COD" ? "COD" : "Online"}</p>
        </div>
        <p className="shrink-0 text-sm font-extrabold">{formatINR(order.total)}</p>
      </Card>
    </Link>
  );
}

export function AccountShortcuts({ counts }: { counts: { orders: number; wishlist: number; addresses: number; unread: number } }) {
  const tiles = [
    { href: "/account/orders", icon: Package, label: "Orders", value: counts.orders },
    { href: "/account/wishlist", icon: Heart, label: "Wishlist", value: counts.wishlist },
    { href: "/account/addresses", icon: MapPin, label: "Addresses", value: counts.addresses },
    { href: "/account/notifications", icon: Bell, label: "Unread alerts", value: counts.unread },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {tiles.map((t) => (
        <Link key={t.href} href={t.href} className="rounded-2xl bg-white p-4 ring-1 ring-line transition hover:shadow-card">
          <t.icon className="size-5 text-brand-700" />
          <p className="mt-2 text-2xl font-extrabold">{t.value}</p>
          <p className="text-xs text-muted">{t.label}</p>
        </Link>
      ))}
    </div>
  );
}

export function OfferCard({ code, description }: { code: string; description: string | null }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-dashed border-saffron-400 bg-saffron-50 p-3">
      <Gift className="size-5 shrink-0 text-saffron-600" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold">Use code <span className="rounded bg-white px-1.5 font-mono">{code}</span></p>
        {description && <p className="text-xs text-muted">{description}</p>}
      </div>
    </div>
  );
}
