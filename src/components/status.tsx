import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { OrderStatus, PaymentMethod, PaymentStatus } from "@prisma/client";
import { Badge } from "@/components/ui/card";
import {
  ORDER_STATUS_LABEL, PAYMENT_METHOD_LABEL, PAYMENT_STATUS_LABEL, orderTone, paymentTone,
} from "@/lib/order-status";
import { cn } from "@/lib/utils";

const PAYMENT_ICON: Partial<Record<PaymentStatus, string>> = {
  PAID: "🟢", PENDING: "🟡", AUTHORIZED: "🟡", FAILED: "🔴", CANCELLED: "🔴", REFUNDED: "🔵", PARTIALLY_REFUNDED: "🔵", REFUND_PENDING: "🟣",
};

export function PaymentStatusBadge({ status, withIcon, label }: { status: PaymentStatus; withIcon?: boolean; label?: string }) {
  return (
    <Badge tone={paymentTone(status)}>
      {withIcon && <span aria-hidden>{PAYMENT_ICON[status]}</span>}
      {label ?? PAYMENT_STATUS_LABEL[status]}
    </Badge>
  );
}

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <Badge tone={orderTone(status)} dot>{ORDER_STATUS_LABEL[status]}</Badge>;
}

export function MethodBadge({ method }: { method: PaymentMethod }) {
  return <Badge tone={method === "COD" ? "orange" : "blue"}>{method === "COD" ? "COD" : "Online"}</Badge>;
}

export function methodLabel(m: PaymentMethod) {
  return PAYMENT_METHOD_LABEL[m];
}

/** Server-rendered pagination that preserves the current query string. */
export function Pagination({ page, totalPages, basePath, params }: { page: number; totalPages: number; basePath: string; params: Record<string, string | undefined> }) {
  if (totalPages <= 1) return null;
  const href = (p: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
    q.set("page", String(p));
    return `${basePath}?${q.toString()}`;
  };
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1).filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1);
  return (
    <nav className="mt-6 flex items-center justify-center gap-1" aria-label="Pagination">
      <Link aria-disabled={page <= 1} href={href(Math.max(1, page - 1))} className={cn("grid size-9 place-items-center rounded-lg border border-line bg-white", page <= 1 && "pointer-events-none opacity-40")}>
        <ChevronLeft className="size-4" />
      </Link>
      {pages.map((p, i) => (
        <span key={p} className="flex items-center">
          {i > 0 && pages[i - 1] !== p - 1 && <span className="px-1 text-muted">…</span>}
          <Link href={href(p)} className={cn("grid h-9 min-w-9 place-items-center rounded-lg border px-2 text-sm font-semibold", p === page ? "border-brand-700 bg-brand-700 text-white" : "border-line bg-white hover:bg-slate-50")}>
            {p}
          </Link>
        </span>
      ))}
      <Link aria-disabled={page >= totalPages} href={href(Math.min(totalPages, page + 1))} className={cn("grid size-9 place-items-center rounded-lg border border-line bg-white", page >= totalPages && "pointer-events-none opacity-40")}>
        <ChevronRight className="size-4" />
      </Link>
    </nav>
  );
}
