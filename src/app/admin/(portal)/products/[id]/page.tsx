import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { PageHeader } from "@/components/admin/ui";
import { ProductEditor, type ProductFormValues } from "@/components/admin/product-editor";
import { requireStaffPage } from "@/server/admin-guard";

export const metadata: Metadata = { title: "Edit product" };

const r = (p: number | null | undefined) => (p === null || p === undefined ? "" : String(p / 100));

export default async function ProductEditPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaffPage("products:manage");
  const { id } = await params;
  const isNew = id === "new";
  const [product, categories, settings] = await Promise.all([
    isNew ? null : db.product.findFirst({ where: { id, deletedAt: null }, include: { images: { orderBy: { position: "asc" } }, variants: { where: { isActive: true }, orderBy: { position: "asc" } } } }),
    db.category.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    getSettings(),
  ]);
  if (!isNew && !product) notFound();

  const initial: ProductFormValues = product
    ? {
        name: product.name, slug: product.slug, sku: product.sku, brand: product.brand ?? "", categoryId: product.categoryId ?? "",
        description: product.description, status: product.status, paymentOption: product.paymentOption,
        price: r(product.price), mrp: r(product.mrp), costPrice: r(product.costPrice), shippingCost: r(product.shippingCost), otherCost: r(product.otherCost),
        gstRate: String(product.gstRate), lowStockThreshold: String(product.lowStockThreshold), isFeatured: product.isFeatured,
        sourceName: product.sourceName ?? "", sourceReference: product.sourceReference ?? "",
        specs: (Array.isArray(product.specs) ? product.specs : []) as { label: string; value: string }[],
        variants: product.variants.map((v) => ({ id: v.id, name: v.name, sku: v.sku, price: r(v.price), mrp: r(v.mrp), stock: String(v.stock), isActive: v.isActive })),
        images: product.images.map((i) => ({ key: i.id, id: i.id, url: i.url, storageKey: i.storageKey, alt: i.alt })),
      }
    : {
        name: "", slug: "", sku: "", brand: "", categoryId: "", description: "", status: "ACTIVE", paymentOption: "ONLINE_AND_COD",
        price: "", mrp: "", costPrice: "", shippingCost: "", otherCost: "0", gstRate: "5", lowStockThreshold: String(settings.defaultLowStockThreshold),
        isFeatured: false, sourceName: "", sourceReference: "", specs: [],
        variants: [{ name: "Default", sku: "", price: "", mrp: "", stock: "0", isActive: true }], images: [],
      };

  return (
    <div>
      <Link href="/admin/products" className="text-sm font-semibold text-brand-700 hover:underline">← Products</Link>
      <PageHeader title={isNew ? "Add product" : "Edit product"} description={isNew ? "Add a product you source (e.g. from Meesho or a wholesaler) with your own photos and pricing." : product!.name} />
      <ProductEditor
        id={isNew ? undefined : product!.id}
        initial={initial}
        categories={categories}
        profitSettings={{ gstMode: settings.gstMode, claimInputTaxCredit: settings.claimInputTaxCredit, gatewayFeeBps: settings.gatewayFeeBps }}
      />
    </div>
  );
}
