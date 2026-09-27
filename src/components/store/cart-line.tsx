"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { removeCartItemAction, updateCartItemAction } from "@/actions/cart";
import { ProductImage } from "@/components/product-image";
import { Badge } from "@/components/ui/card";
import { discountPercent, formatINR } from "@/lib/money";
import type { CartLine } from "@/server/cart";

export function CartLineRow({ line }: { line: CartLine }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const change = (q: number) =>
    start(async () => {
      const res = q <= 0 ? await removeCartItemAction(line.id) : await updateCartItemAction(line.id, q);
      if (!res.ok) toast.error(res.error);
      else if (q <= 0) toast.success("Removed from cart");
      router.refresh();
    });
  const off = discountPercent(line.unitMrp, line.unitPrice);
  return (
    <div className={`flex gap-3 rounded-2xl border bg-white p-3 sm:gap-4 sm:p-4 ${line.available ? "border-line" : "border-red-200"} ${pending ? "opacity-60" : ""}`}>
      <Link href={`/products/${line.slug}`} className="relative size-24 shrink-0 overflow-hidden rounded-xl bg-slate-50 sm:size-28">
        <ProductImage src={line.imageUrl} alt={line.name} sizes="112px" />
      </Link>
      <div className="flex min-w-0 flex-1 flex-col">
        <Link href={`/products/${line.slug}`} className="line-clamp-2 text-sm font-semibold hover:text-brand-700">{line.name}</Link>
        {line.variantName && <p className="text-xs text-muted">Option: {line.variantName}</p>}
        <div className="mt-1 flex flex-wrap items-baseline gap-2">
          <span className="font-extrabold">{formatINR(line.unitPrice)}</span>
          {off > 0 && <><span className="text-xs text-muted line-through">{formatINR(line.unitMrp)}</span><span className="text-xs font-bold text-emerald-600">{off}% off</span></>}
        </div>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {line.paymentOption === "ONLINE_ONLY" && <Badge tone="blue">Prepaid only</Badge>}
          {line.paymentOption === "COD_ONLY" && <Badge tone="orange">COD only</Badge>}
          {line.issue && <Badge tone="red">{line.issue}</Badge>}
        </div>
        <div className="mt-auto flex items-center justify-between pt-2">
          <div className="flex items-center rounded-lg border border-line">
            <button className="grid size-8 place-items-center disabled:opacity-40" disabled={pending || line.quantity <= 1} onClick={() => change(line.quantity - 1)} aria-label="Decrease quantity"><Minus className="size-3.5" /></button>
            <span className="w-8 text-center text-sm font-bold">{line.quantity}</span>
            <button className="grid size-8 place-items-center disabled:opacity-40" disabled={pending || line.quantity >= Math.min(10, line.stock)} onClick={() => change(line.quantity + 1)} aria-label="Increase quantity"><Plus className="size-3.5" /></button>
          </div>
          <button className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:underline" disabled={pending} onClick={() => change(0)}>
            <Trash2 className="size-3.5" /> Remove
          </button>
        </div>
      </div>
    </div>
  );
}
