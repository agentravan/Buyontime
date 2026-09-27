"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Heart, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { addToCartAction, toggleWishlistAction } from "@/actions/cart";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function AddToCartButton({
  variantId, quantity = 1, label = "Add to cart", goToCart, className, size, variant, disabled,
}: { variantId: string; quantity?: number; label?: string; goToCart?: boolean; className?: string; size?: ButtonProps["size"]; variant?: ButtonProps["variant"]; disabled?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      className={className}
      size={size}
      variant={variant}
      disabled={disabled}
      loading={pending}
      onClick={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await addToCartAction(variantId, quantity);
          if (!res.ok) { toast.error(res.error); return; }
          if (goToCart) router.push("/cart");
          else {
            toast.success("Added to cart", { action: { label: "View cart", onClick: () => router.push("/cart") } });
            router.refresh();
          }
        });
      }}
    >
      {!pending && !goToCart && <ShoppingBag />}
      {label}
    </Button>
  );
}

export function WishlistButton({ productId, initial, className, withLabel }: { productId: string; initial: boolean; className?: string; withLabel?: boolean }) {
  const router = useRouter();
  const [saved, setSaved] = useState(initial);
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      aria-label={saved ? "Remove from wishlist" : "Save to wishlist"}
      aria-pressed={saved}
      disabled={pending}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        start(async () => {
          const res = await toggleWishlistAction(productId);
          if (!res.ok) {
            toast.error(res.error);
            if (res.code === "UNAUTHENTICATED") router.push(`/login?next=${encodeURIComponent(location.pathname)}`);
            return;
          }
          setSaved(res.data.saved);
          toast.success(res.data.saved ? "Saved to wishlist" : "Removed from wishlist");
        });
      }}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full transition",
        withLabel ? "h-10 border border-line bg-white px-4 text-sm font-semibold hover:bg-slate-50" : "size-9 bg-white/90 shadow-sm backdrop-blur hover:scale-105",
        className,
      )}
    >
      <Heart className={cn("size-[18px]", saved ? "fill-rose-500 text-rose-500" : "text-slate-600")} />
      {withLabel && (saved ? "Saved" : "Wishlist")}
    </button>
  );
}
