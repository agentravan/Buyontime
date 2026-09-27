import type { Metadata } from "next";
import Link from "next/link";
import { CreditCard } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatINR } from "@/lib/money";
import { CUSTOMER_PAYMENT_LABEL, PAYMENT_METHOD_LABEL } from "@/lib/order-status";
import { formatDate } from "@/lib/utils";
import { Card, EmptyState } from "@/components/ui/card";
import { PaymentStatusBadge } from "@/components/status";

export const metadata: Metadata = { title: "Payment history", robots: { index: false } };

export default async function PaymentsPage() {
  const user = await requireUser();
  const payments = await db.payment.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { order: { select: { orderNumber: true } }, refunds: true },
  });
  return (
    <div>
      <h1 className="mb-4 text-xl font-extrabold">Payment history</h1>
      {payments.length === 0 ? <EmptyState icon={<CreditCard />} title="No payments yet" /> : (
        <Card className="divide-y divide-line">
          {payments.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <Link href={`/account/orders/${p.order.orderNumber}`} className="text-sm font-bold hover:text-brand-700">{p.order.orderNumber}</Link>
                <p className="text-xs text-muted">{formatDate(p.createdAt, true)} · {PAYMENT_METHOD_LABEL[p.method]}{p.gatewayMethod ? ` (${p.gatewayMethod.toUpperCase()})` : ""}</p>
                {p.razorpayPaymentId && <p className="font-mono text-[11px] text-muted">{p.razorpayPaymentId}</p>}
                {p.failureReason && p.status === "FAILED" && <p className="text-xs text-red-600">{p.failureReason}</p>}
                {p.refunds.map((r) => <p key={r.id} className="text-xs text-sky-700">Refund {formatINR(r.amount)} — {r.status === "PROCESSED" ? "completed" : r.status === "FAILED" ? "failed" : "processing"}</p>)}
              </div>
              <div className="text-right">
                <p className="font-extrabold">{formatINR(p.amount)}</p>
                <PaymentStatusBadge status={p.status} label={p.method === "COD" && p.status === "PENDING" ? "Pay on delivery" : CUSTOMER_PAYMENT_LABEL[p.status]} />
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
