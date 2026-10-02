import type { Metadata } from "next";
import Link from "next/link";
import type { Prisma, ProductStatus } from "@prisma/client";
import { Plus } from "lucide-react";
import { db } from "@/lib/db";
import { discountPercent, formatINR } from "@/lib/money";
import { paymentOptionLabel } from "@/lib/payment-rules";
import { calculateUnitProfit } from "@/lib/profit";
import { getSettings } from "@/lib/settings";
import { pageParam, strParam } from "@/lib/utils";
import { Badge } from "@/components/ui/card";
import { Pagination } from "@/components/status";
import { ProductImage } from "@/components/product-image";
import { FilterBar, FilterField, PageHeader, Table, inputCls } from "@/components/admin/ui";
import { ProductRowActions } from "@/components/admin/product-row-actions";
import { requireStaffPage } from "@/server/admin-guard";

export const metadata: Metadata = { title: "Products" };

export default async function AdminProductsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireStaffPage("products:manage");
  const sp = await searchParams;
  const q = strParam(sp.q);
  const status = strParam(sp.status);
  const category = strParam(sp.category);
  const payment = strParam(sp.payment);
  const page = pageParam(sp.page);
  const take = 20;
  const where: Prisma.ProductWhereInput = {
    deletedAt: null,
    ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { sku: { contains: q, mode: "insensitive" } }, { brand: { contains: q, mode: "insensitive" } }, { variants: { some: { sku: { contains: q, mode: "insensitive" } } } }] } : {}),
    ...(status && ["ACTIVE", "DRAFT", "DISABLED"].includes(status) ? { status: status as ProductStatus } : {}),
    ...(category ? { categoryId: category } : {}),
    ...(payment && ["ONLINE_ONLY", "COD_ONLY", "ONLINE_AND_COD"].includes(payment) ? { paymentOption: payment as "ONLINE_ONLY" } : {}),
  };
  const [products, total, categories, settings] = await Promise.all([
    db.product.findMany({
      where, orderBy: { updatedAt: "desc" }, skip: (page - 1) * take, take,
      include: { category: { select: { name: true } }, images: { orderBy: { position: "asc" }, take: 1 }, variants: { where: { isActive: true }, select: { stock: true, soldCount: true } } },
    }),
    db.product.count({ where }),
    db.category.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    getSettings(),
  ]);

  return (
    <div>
      <PageHeader
        title="Products"
        description={`${total} products`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/products/import" className="inline-flex h-10 items-center rounded-xl border border-line bg-white px-4 text-sm font-semibold hover:bg-slate-50">Bulk import</Link>
            <Link href="/admin/products/new" className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800"><Plus className="size-4" /> Add product</Link>
          </div>
        }
      />
      <FilterBar action="/admin/products">
        <FilterField label="Search" className="min-w-52 flex-1"><input name="q" defaultValue={q} placeholder="Name, SKU or brand" className={inputCls} /></FilterField>
        <FilterField label="Status"><select name="status" defaultValue={status ?? ""} className={inputCls}><option value="">All</option><option value="ACTIVE">Active</option><option value="DRAFT">Draft</option><option value="DISABLED">Disabled</option></select></FilterField>
        <FilterField label="Category"><select name="category" defaultValue={category ?? ""} className={inputCls}><option value="">All</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></FilterField>
        <FilterField label="Payment"><select name="payment" defaultValue={payment ?? ""} className={inputCls}><option value="">All</option><option value="ONLINE_ONLY">Online only</option><option value="COD_ONLY">COD only</option><option value="ONLINE_AND_COD">Online + COD</option></select></FilterField>
      </FilterBar>
      <Table>
        <thead><tr><th>Product</th><th>SKU</th><th>Category</th><th className="text-right">MRP / Price</th><th className="text-right">Cost</th><th className="text-right">Est. profit</th><th className="text-right">Stock</th><th>Payment</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {products.length === 0 && <tr><td colSpan={10} className="py-10 text-center text-muted">No products yet. <Link href="/admin/products/new" className="font-semibold text-brand-700">Add your first product</Link></td></tr>}
          {products.map((p) => {
            const stock = p.variants.reduce((s, v) => s + v.stock, 0);
            const unit = calculateUnitProfit(p, settings, "ONLINE");
            return (
              <tr key={p.id}>
                <td>
                  <Link href={`/admin/products/${p.id}`} className="flex items-center gap-3">
                    <span className="relative size-11 shrink-0 overflow-hidden rounded-lg bg-slate-50"><ProductImage src={p.images[0]?.url} alt={p.name} sizes="44px" /></span>
                    <span className="line-clamp-2 max-w-64 font-medium hover:text-brand-700">{p.name}</span>
                  </Link>
                </td>
                <td className="font-mono text-xs">{p.sku}</td>
                <td className="text-xs">{p.category?.name ?? "—"}</td>
                <td className="text-right"><span className="text-xs text-muted line-through">{formatINR(p.mrp)}</span><br /><b>{formatINR(p.price)}</b> <span className="text-xs text-emerald-700">{discountPercent(p.mrp, p.price)}%</span></td>
                <td className="text-right">{formatINR(p.costPrice)}</td>
                <td className={`text-right font-semibold ${unit.profit < 0 ? "text-red-600" : "text-emerald-700"}`}>{formatINR(unit.profit)}<br /><span className="text-xs font-normal text-muted">{unit.marginPct}%</span></td>
                <td className={`text-right font-semibold ${stock === 0 ? "text-red-600" : stock <= p.lowStockThreshold ? "text-saffron-600" : ""}`}>{stock}</td>
                <td><Badge tone={p.paymentOption === "ONLINE_ONLY" ? "blue" : p.paymentOption === "COD_ONLY" ? "orange" : "gray"}>{paymentOptionLabel(p.paymentOption)}</Badge></td>
                <td><Badge tone={p.status === "ACTIVE" ? "green" : p.status === "DRAFT" ? "yellow" : "red"}>{p.status.toLowerCase()}</Badge></td>
                <td><ProductRowActions id={p.id} slug={p.slug} status={p.status} /></td>
              </tr>
            );
          })}
        </tbody>
      </Table>
      <Pagination page={page} totalPages={Math.ceil(total / take)} basePath="/admin/products" params={{ q, status, category, payment }} />
    </div>
  );
}
