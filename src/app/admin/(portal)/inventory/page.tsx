import type { Metadata } from "next";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { formatINR } from "@/lib/money";
import { pageParam, strParam } from "@/lib/utils";
import { Badge } from "@/components/ui/card";
import { Pagination } from "@/components/status";
import { FilterBar, FilterField, PageHeader, Table, inputCls } from "@/components/admin/ui";
import { StockEditor } from "@/components/admin/stock-editor";
import { requireStaffPage } from "@/server/admin-guard";

export const metadata: Metadata = { title: "Inventory" };

export default async function InventoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireStaffPage("inventory:manage");
  const sp = await searchParams;
  const q = strParam(sp.q);
  const filter = strParam(sp.filter);
  const page = pageParam(sp.page);
  const take = 30;

  const where: Prisma.ProductVariantWhereInput = {
    isActive: true,
    product: { deletedAt: null },
    ...(q ? { OR: [{ sku: { contains: q, mode: "insensitive" } }, { product: { name: { contains: q, mode: "insensitive" } } }] } : {}),
    ...(filter === "out" ? { stock: { lte: 0 } } : {}),
  };
  // Low stock compares against each product's own threshold, so it is filtered in SQL via a raw id list.
  let idFilter: string[] | undefined;
  if (filter === "low") {
    const rows = await db.$queryRaw<{ id: string }[]>`
      SELECT v.id FROM "ProductVariant" v JOIN "Product" p ON p.id = v."productId"
      WHERE v."isActive" = true AND p."deletedAt" IS NULL AND v.stock > 0 AND v.stock <= p."lowStockThreshold"`;
    idFilter = rows.map((r) => r.id);
  }
  const finalWhere: Prisma.ProductVariantWhereInput = idFilter ? { AND: [where, { id: { in: idFilter } }] } : where;

  const [variants, total] = await Promise.all([
    db.productVariant.findMany({
      where: finalWhere, orderBy: [{ stock: "asc" }, { updatedAt: "desc" }], skip: (page - 1) * take, take,
      include: { product: { select: { id: true, name: true, price: true, mrp: true, lowStockThreshold: true, status: true } } },
    }),
    db.productVariant.count({ where: finalWhere }),
  ]);
  const ids = variants.map((v) => v.id);
  const [reserved, damaged] = ids.length ? await Promise.all([
    db.orderItem.groupBy({ by: ["variantId"], where: { variantId: { in: ids }, order: { status: "PENDING_PAYMENT", stockState: "RESERVED" } }, _sum: { quantity: true } }),
    db.inventoryMovement.groupBy({ by: ["variantId", "type"], where: { variantId: { in: ids }, type: { in: ["RETURN_DAMAGED", "RETURN_TO_SUPPLIER"] } }, _sum: { quantity: true } }),
  ]) : [[], []];
  const reservedBy = new Map(reserved.map((r) => [r.variantId, r._sum.quantity ?? 0]));
  const damagedBy = new Map<string, number>();
  for (const d of damaged) damagedBy.set(d.variantId, (damagedBy.get(d.variantId) ?? 0) + (d._sum.quantity ?? 0));

  return (
    <div>
      <PageHeader title="Inventory" description="Stock is reserved at checkout, committed on payment/COD confirmation, released on cancellation, and every change is recorded in the inventory ledger." />
      <FilterBar action="/admin/inventory">
        <FilterField label="Search" className="min-w-52 flex-1"><input name="q" defaultValue={q} placeholder="Product or SKU" className={inputCls} /></FilterField>
        <FilterField label="Show"><select name="filter" defaultValue={filter ?? ""} className={inputCls}><option value="">All</option><option value="low">Low stock</option><option value="out">Out of stock</option></select></FilterField>
      </FilterBar>
      <Table>
        <thead><tr><th>Product</th><th>SKU</th><th className="text-right">Current stock</th><th className="text-right">Reserved</th><th className="text-right">Available</th><th className="text-right">Sold</th><th className="text-right">Damaged / RTS</th><th>Alert</th><th>Update</th></tr></thead>
        <tbody>
          {variants.length === 0 && <tr><td colSpan={9} className="py-10 text-center text-muted">Nothing to show.</td></tr>}
          {variants.map((v) => {
            const res = reservedBy.get(v.id) ?? 0;
            const low = v.stock > 0 && v.stock <= v.product.lowStockThreshold;
            return (
              <tr key={v.id}>
                <td><Link href={`/admin/products/${v.product.id}`} className="font-medium hover:text-brand-700">{v.product.name}</Link>{!v.isDefault && <p className="text-xs text-muted">{v.name}</p>}</td>
                <td className="font-mono text-xs">{v.sku}</td>
                <td className="text-right">{v.stock + res}</td>
                <td className="text-right text-muted">{res}</td>
                <td className="text-right font-bold">{v.stock}</td>
                <td className="text-right">{v.soldCount}</td>
                <td className="text-right text-muted">{damagedBy.get(v.id) ?? 0}</td>
                <td>{v.stock <= 0 ? <Badge tone="red">Out of stock</Badge> : low ? <Badge tone="orange">Low stock</Badge> : <Badge tone="green">OK</Badge>}</td>
                <td><StockEditor variantId={v.id} stock={v.stock} price={(v.price ?? v.product.price) / 100} mrp={(v.mrp ?? v.product.mrp) / 100} /> <span className="text-[11px] text-muted">{formatINR(v.price ?? v.product.price)}</span></td>
              </tr>
            );
          })}
        </tbody>
      </Table>
      <Pagination page={page} totalPages={Math.ceil(total / take)} basePath="/admin/inventory" params={{ q, filter }} />
    </div>
  );
}
