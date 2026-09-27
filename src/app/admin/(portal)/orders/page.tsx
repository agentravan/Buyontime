import type { Metadata } from "next";
import Link from "next/link";
import type { OrderStatus, PaymentMethod, PaymentStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { formatINR } from "@/lib/money";
import { ORDER_STATUS_LABEL, PAYMENT_STATUS_LABEL } from "@/lib/order-status";
import { can } from "@/lib/permissions";
import { getSettings } from "@/lib/settings";
import { formatDate, pageParam, strParam } from "@/lib/utils";
import { MethodBadge, OrderStatusBadge, Pagination, PaymentStatusBadge } from "@/components/status";
import { FilterBar, FilterField, PageHeader, Table, inputCls } from "@/components/admin/ui";
import { requireStaffPage } from "@/server/admin-guard";
import { orderProfit, profitInclude } from "@/server/profit";

export const metadata: Metadata = { title: "Orders" };

const STATUSES = Object.keys(ORDER_STATUS_LABEL) as OrderStatus[];
const PAY = Object.keys(PAYMENT_STATUS_LABEL) as PaymentStatus[];

export default async function AdminOrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireStaffPage("orders:view");
  const finance = can(user.role, "finance:view");
  const sp = await searchParams;
  const f = {
    q: strParam(sp.q), status: strParam(sp.status), payment: strParam(sp.payment), method: strParam(sp.method),
    from: strParam(sp.from), to: strParam(sp.to), city: strParam(sp.city), state: strParam(sp.state), pincode: strParam(sp.pincode), product: strParam(sp.product),
  };
  const page = pageParam(sp.page);
  const take = 25;

  const where: Prisma.OrderWhereInput = { AND: [] as Prisma.OrderWhereInput[] };
  const and = where.AND as Prisma.OrderWhereInput[];
  if (f.q) and.push({ OR: [
    { orderNumber: { contains: f.q, mode: "insensitive" } },
    { customerName: { contains: f.q, mode: "insensitive" } },
    { email: { contains: f.q, mode: "insensitive" } },
    { phone: { contains: f.q } },
    { payments: { some: { OR: [{ razorpayPaymentId: { contains: f.q } }, { razorpayOrderId: { contains: f.q } }] } } },
  ] });
  if (f.status && STATUSES.includes(f.status as OrderStatus)) and.push({ status: f.status as OrderStatus });
  if (f.payment && PAY.includes(f.payment as PaymentStatus)) and.push({ paymentStatus: f.payment as PaymentStatus });
  if (f.method === "ONLINE" || f.method === "COD") and.push({ paymentMethod: f.method as PaymentMethod });
  if (f.from) and.push({ createdAt: { gte: new Date(`${f.from}T00:00:00+05:30`) } });
  if (f.to) and.push({ createdAt: { lte: new Date(`${f.to}T23:59:59+05:30`) } });
  if (f.city) and.push({ city: { contains: f.city, mode: "insensitive" } });
  if (f.state) and.push({ state: { contains: f.state, mode: "insensitive" } });
  if (f.pincode) and.push({ pincode: f.pincode });
  if (f.product) and.push({ items: { some: { OR: [{ name: { contains: f.product, mode: "insensitive" } }, { sku: { contains: f.product, mode: "insensitive" } }] } } });

  const [orders, total, settings] = await Promise.all([
    db.order.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * take, take, include: { ...profitInclude, shipment: true } }),
    db.order.count({ where }),
    getSettings(),
  ]);

  return (
    <div>
      <PageHeader title="Orders" description={`${total.toLocaleString("en-IN")} orders`} />
      <FilterBar action="/admin/orders">
        <FilterField label="Search" className="min-w-52 flex-1"><input name="q" defaultValue={f.q} placeholder="Order ID, name, phone, email, payment ID" className={inputCls} /></FilterField>
        <FilterField label="Order status">
          <select name="status" defaultValue={f.status ?? ""} className={inputCls}><option value="">All</option>{STATUSES.map((s) => <option key={s} value={s}>{ORDER_STATUS_LABEL[s]}</option>)}</select>
        </FilterField>
        <FilterField label="Payment status">
          <select name="payment" defaultValue={f.payment ?? ""} className={inputCls}><option value="">All</option>{PAY.map((s) => <option key={s} value={s}>{PAYMENT_STATUS_LABEL[s]}</option>)}</select>
        </FilterField>
        <FilterField label="Method">
          <select name="method" defaultValue={f.method ?? ""} className={inputCls}><option value="">All</option><option value="ONLINE">Online</option><option value="COD">COD</option></select>
        </FilterField>
        <FilterField label="From"><input type="date" name="from" defaultValue={f.from} className={inputCls} /></FilterField>
        <FilterField label="To"><input type="date" name="to" defaultValue={f.to} className={inputCls} /></FilterField>
        <FilterField label="Product / SKU"><input name="product" defaultValue={f.product} className={inputCls} /></FilterField>
        <FilterField label="City"><input name="city" defaultValue={f.city} className={inputCls} /></FilterField>
        <FilterField label="State"><input name="state" defaultValue={f.state} className={inputCls} /></FilterField>
        <FilterField label="Pincode"><input name="pincode" defaultValue={f.pincode} className={inputCls} inputMode="numeric" maxLength={6} /></FilterField>
      </FilterBar>

      <Table>
        <thead>
          <tr><th>Order</th><th>Customer</th><th>Date</th><th className="text-right">Amount</th><th>Method</th><th>Payment</th><th>Status</th><th>Courier / tracking</th>{finance && <th className="text-right">Profit</th>}</tr>
        </thead>
        <tbody>
          {orders.length === 0 && <tr><td colSpan={9} className="py-10 text-center text-muted">No orders match these filters.</td></tr>}
          {orders.map((o) => {
            const p = finance ? orderProfit(o, settings) : null;
            return (
              <tr key={o.id}>
                <td>
                  <Link href={`/admin/orders/${o.id}`} className="font-semibold text-brand-700 hover:underline">{o.orderNumber}</Link>
                  {o.needsAttention && <span className="ml-1" title={o.needsAttention}>⚠</span>}
                </td>
                <td><p className="font-medium">{o.customerName}</p><p className="text-xs text-muted">{o.city}, {o.pincode}</p></td>
                <td className="whitespace-nowrap text-xs">{formatDate(o.createdAt, true)}</td>
                <td className="text-right font-semibold">{formatINR(o.total)}</td>
                <td><MethodBadge method={o.paymentMethod} /></td>
                <td><PaymentStatusBadge status={o.paymentStatus} withIcon /></td>
                <td><OrderStatusBadge status={o.status} /></td>
                <td className="text-xs">{o.shipment?.courier ?? "—"}{o.shipment?.trackingId ? <><br /><span className="font-mono">{o.shipment.trackingId}</span></> : null}</td>
                {finance && <td className={`text-right font-semibold ${p && p.profit < 0 ? "text-red-600" : ""}`}>{p ? formatINR(p.profit) : "—"}{p?.isEstimate && <span className="text-[10px] text-muted"> est.</span>}</td>}
              </tr>
            );
          })}
        </tbody>
      </Table>
      <Pagination page={page} totalPages={Math.ceil(total / take)} basePath="/admin/orders" params={f} />
    </div>
  );
}
