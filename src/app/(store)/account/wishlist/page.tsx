import type { Metadata } from "next";
import Link from "next/link";
import { Heart } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { EmptyState } from "@/components/ui/card";
import { ProductGrid } from "@/components/store/product-card";
import { cardSelect, toCard } from "@/server/catalog";

export const metadata: Metadata = { title: "Wishlist", robots: { index: false } };

export default async function WishlistPage() {
  const user = await requireUser();
  const rows = await db.wishlistItem.findMany({
    where: { userId: user.id, product: { status: "ACTIVE", deletedAt: null } },
    orderBy: { createdAt: "desc" },
    select: { product: { select: cardSelect } },
  });
  const products = rows.map((r) => toCard(r.product));
  return (
    <div>
      <h1 className="mb-4 text-xl font-extrabold">Wishlist <span className="text-base font-semibold text-muted">({products.length})</span></h1>
      {products.length === 0 ? (
        <EmptyState icon={<Heart />} title="Your wishlist is empty" description="Tap the heart on any product to save it for later." action={<Link href="/products" className="rounded-xl bg-brand-700 px-5 py-2.5 text-sm font-semibold text-white">Explore products</Link>} />
      ) : (
        <ProductGrid products={products} savedIds={new Set(products.map((p) => p.id))} />
      )}
    </div>
  );
}
