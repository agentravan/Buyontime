import type { Metadata } from "next";
import Link from "next/link";
import type { PaymentStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { razorpayConfig } from "@/lib/env";
import { formatINR } from "@/lib/money";
import { PAYMENT_STATUS_LABEL } from "@/lib/order-status";
import { formatDate, pageParam, strParam } from "@/lib/utils";
import { Badge, StatCard } from "@/components/ui/card";
import { MethodBadge, OrderStatusBadge, Pagination, PaymentStatusBadge } from "@/components/status";
import { FilterBar, FilterField, PageHeader, Table, inputCls } from "@/components/admin/ui";
import { ReconcileButtons } from "@/components/admin/reconcile-buttons";
import { requireStaffPage } from "@/server/admin-guard";

export const metadata: Metadata = { title: "Payments & reconciliation" };

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireStaffPage("payments:view");
  const sp = await searchParams;
  const filter = strParam(sp.filter);
  const status = strParam(sp.status);
  const method = strParam(sp.method);
  const q = strParam(sp.q);
  const page = pageParam(sp.page);
  const take = 25;
  const where: Prisma.PaymentWhereInput = {
    ...(filter === "mismatch" ? { reconciliationStatus: "MISMATCH" } : {}),
    ...(status && status in PAYMENT_STATUS_LABEL ? { status: status as PaymentStatus } : {}),
    ...(method === "ONLINE" || method === "COD" ? { method } : {}),
    ...(q ? { OR: [{ razorpayPaymentId: { contains: q } }, { razorpayOrderId: { contains: q } }, { order: { orderNumber: { contains: q, mode: "insensitive" } } }] } : {}),
  };
  const [payments, total, counts, mismatches] = await Promise.all([
    db.payment.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * take, take, include: { order: { select: { id: true, orderNumber: true, status: true, customerName: true } } } }),
    db.payment.count({ where }),
    db.payment.groupBy({ by: ["status"], _count: { _all: true }, _sum: { amount: true } }),
    db.payment.count({ where: { reconciliationStatus: "MISMATCH" } }),
  ]);
  const c = (s: PaymentStatus[]) => counts.filter((r) => s.includes(r.status)).reduce((a, r) => a + r._count._all, 0);
  const received = counts.filter((r) => r.status === "PAID").reduce((a, r) => a + (r._sum.amount ?? 0), 0);
  const rzp = razorpayConfig();

  return (
    <div>
      <PageHeader title="Payments" description="Payment status is synchronised automatically from Razorpay (checkout verification + webhooks). Use reconciliation to double-check against Razorpay." />
      {!rzp.configured && <p className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Razorpay is not configured — set RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET to accept online payments.</p>}
      {rzp.configured && !rzp.webhookConfigured && <p className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">RAZORPAY_WEBHOOK_SECRET is not set — webhooks are rejected, so payments only update via checkout verification. Configure it for fully automatic status updates.</p>}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="🟢 Payment received" value={c(["PAID"])} hint={formatINR(received)} tone="green" />
        <StatCard label="🟡 Pending" value={c(["PENDING", "AUTHORIZED"])} tone="yellow" />
        <StatCard label="🔴 Failed" value={c(["FAILED", "CANCELLED"])} tone="red" />
        <StatCard label="🔵 Refunded" value={c(["REFUNDED", "PARTIALLY_REFUNDED", "REFUND_PENDING"])} tone="blue" />
        <Link href="/admin/payments?filter=mismatch"><StatCard label="⚠ Reconciliation" value={mismatches} hint="mismatches to review" tone={mismatches ? "orange" : "gray"} /></Link>
      </div>
      <FilterBar action="/admin/payments">
        <FilterField label="Search" className="min-w-52 flex-1"><input name="q" defaultValue={q} placeholder="Order ID or Razorpay ID" className={inputCls} /></FilterField>
        <FilterField label="Status"><select name="status" defaultValue={status ?? ""} className={inputCls}><option value="">All</option>{Object.entries(PAYMENT_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></FilterField>
        <FilterField label="Method"><select name="method" defaultValue={method ?? ""} className={inputCls}><option value="">All</option><option value="ONLINE">Online</option><option value="COD">COD</option></select></FilterField>
        <FilterField label="Show"><select name="filter" defaultValue={filter ?? ""} className={inputCls}><option value="">All payments</option><option value="mismatch">Mismatches only</option></select></FilterField>
      </FilterBar>
      <Table>
        <thead><tr><th>Order</th><th>Payment ID</th><th>Razorpay order ID</th><th className="text-right">Amount</th><th>Method</th><th>Payment status</th><th>Order status</th><th>Date</th><th>Reconciliation</th></tr></thead>
        <tbody>
          {payments.length === 0 && <tr><td colSpan={9} className="py-10 text-center text-muted">No payments.</td></tr>}
          {payments.map((p) => (
            <tr key={p.id} className={p.reconciliationStatus === "MISMATCH" ? "bg-amber-50/70" : ""}>
              <td><Link href={`/admin/orders/${p.order.id}`} className="font-semibold text-brand-700 hover:underline">{p.order.orderNumber}</Link><p className="text-xs text-muted">{p.order.customerName}</p></td>
              <td className="font-mono text-xs">{p.razorpayPaymentId ?? "—"}</td>
              <td className="font-mono text-xs">{p.razorpayOrderId ?? "—"}</td>
              <td className="text-right font-semibold">{formatINR(p.amount)}</td>
              <td><MethodBadge method={p.method} /></td>
              <td><PaymentStatusBadge status={p.status} withIcon /></td>
              <td><OrderStatusBadge status={p.order.status} /></td>
              <td className="whitespace-nowrap text-xs">{formatDate(p.createdAt, true)}</td>
              <td className="min-w-52">
                {p.reconciliationStatus === "MISMATCH" && <p className="mb-1 text-xs font-bold text-amber-800">⚠ PAYMENT RECONCILIATION REQUIRED<br /><span className="font-medium">{p.reconciliationNote}</span></p>}
                {p.reconciliationStatus === "OK" && <Badge tone="green">Matches Razorpay</Badge>}
                {p.reconciliationStatus === "RESOLVED" && <Badge tone="blue">Resolved</Badge>}
                {p.method === "ONLINE" && p.razorpayOrderId && rzp.configured && <ReconcileButtons paymentId={p.id} mismatch={p.reconciliationStatus === "MISMATCH"} />}
                {p.lastCheckedAt && <p className="text-[11px] text-muted">Checked {formatDate(p.lastCheckedAt, true)}</p>}
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
      <Pagination page={page} totalPages={Math.ceil(total / take)} basePath="/admin/payments" params={{ q, status, method, filter }} />
    </div>
  );
}
