"use client";

import { useState } from "react";
import { Banknote, CreditCard, Minus, Plus } from "lucide-react";
import type { PaymentOption } from "@prisma/client";
import { AddToCartButton, WishlistButton } from "@/components/store/cart-buttons";
import { Price } from "@/components/store/product-card";
import { cn } from "@/lib/utils";

type Variant = { id: string; name: string; isDefault: boolean; price: number; mrp: number; stock: number };

export function PurchasePanel({
  productId, variants, paymentOption, saved, lowStockThreshold, codEnabled,
}: {
  productId: string;
  basePrice: number;
  baseMrp: number;
  variants: Variant[];
  paymentOption: PaymentOption;
  saved: boolean;
  lowStockThreshold: number;
  codEnabled: boolean;
}) {
  const firstAvailable = variants.find((v) => v.stock > 0) ?? variants[0];
  const [variantId, setVariantId] = useState(firstAvailable?.id);
  const [qty, setQty] = useState(1);
  const v = variants.find((x) => x.id === variantId) ?? variants[0];
  if (!v) return <p className="text-sm text-red-600">This product is currently unavailable.</p>;
  const showVariants = variants.length > 1 || !variants[0].isDefault;
  const maxQty = Math.min(10, v.stock);
  const inStock = v.stock > 0;
  const online = paymentOption !== "COD_ONLY";
  const cod = paymentOption !== "ONLINE_ONLY" && codEnabled;

  const actions = (
    <div className="flex gap-2">
      <AddToCartButton variantId={v.id} quantity={qty} className="flex-1" size="lg" variant="outline" disabled={!inStock} label={inStock ? "Add to cart" : "Out of stock"} />
      <AddToCartButton variantId={v.id} quantity={qty} goToCart className="flex-1" size="lg" variant="accent" disabled={!inStock} label="Buy now" />
    </div>
  );

  return (
    <div className="space-y-4">
      <Price price={v.price} mrp={v.mrp} size="lg" />
      <p className="-mt-2 text-xs text-muted">Inclusive of all taxes</p>

      {showVariants && (
        <div>
          <p className="mb-2 text-sm font-semibold">Choose an option</p>
          <div className="flex flex-wrap gap-2">
            {variants.map((x) => (
              <button
                key={x.id}
                onClick={() => { setVariantId(x.id); setQty(1); }}
                disabled={x.stock <= 0}
                className={cn(
                  "min-w-12 rounded-xl border px-3 py-2 text-sm font-semibold transition",
                  x.id === v.id ? "border-brand-700 bg-brand-50 text-brand-800" : "border-line bg-white hover:border-brand-400",
                  x.stock <= 0 && "cursor-not-allowed text-slate-400 line-through",
                )}
              >
                {x.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center rounded-xl border border-line bg-white" aria-label="Quantity">
          <button className="grid size-10 place-items-center disabled:opacity-40" onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1} aria-label="Decrease quantity"><Minus className="size-4" /></button>
          <span className="w-8 text-center text-sm font-bold" aria-live="polite">{qty}</span>
          <button className="grid size-10 place-items-center disabled:opacity-40" onClick={() => setQty((q) => Math.min(maxQty, q + 1))} disabled={qty >= maxQty} aria-label="Increase quantity"><Plus className="size-4" /></button>
        </div>
        <p className={cn("text-sm font-semibold", !inStock ? "text-red-600" : v.stock <= lowStockThreshold ? "text-saffron-600" : "text-emerald-700")}>
          {!inStock ? "Out of stock" : v.stock <= lowStockThreshold ? `Hurry, only ${v.stock} left` : `In stock (${v.stock} available)`}
        </p>
        <WishlistButton productId={productId} initial={saved} withLabel className="ml-auto" />
      </div>

      <div className="hidden md:block">{actions}</div>

      <div className="rounded-xl bg-white p-3 text-sm ring-1 ring-line">
        <p className="mb-2 font-semibold">Payment options for this product</p>
        <div className="flex flex-wrap gap-2">
          {online && <span className="inline-flex items-center gap-1.5 rounded-lg bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-800"><CreditCard className="size-3.5" /> Pay online (UPI, cards, netbanking)</span>}
          {cod && <span className="inline-flex items-center gap-1.5 rounded-lg bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-800"><Banknote className="size-3.5" /> Cash on Delivery</span>}
          {!online && !cod && <span className="text-xs text-red-600">Currently not available for purchase</span>}
        </div>
      </div>

      {/* Sticky mobile purchase bar */}
      <div className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white p-3 md:hidden">{actions}</div>
    </div>
  );
}
