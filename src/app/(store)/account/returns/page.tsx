import type { Metadata } from "next";
import Link from "next/link";
import { RotateCcw } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatINR } from "@/lib/money";
import { RETURN_STATUS_LABEL } from "@/lib/order-status";
import { formatDate } from "@/lib/utils";
import { Badge, Card, EmptyState } from "@/components/ui/card";

export const metadata: Metadata = { title: "Returns & refunds", robots: { index: false } };

export default async function ReturnsPage() {
  const user = await requireUser();
  const [returns, refunds] = await Promise.all([
    db.returnRequest.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, include: { order: { select: { orderNumber: true, items: true } }, items: true } }),
    db.refund.findMany({ where: { order: { userId: user.id } }, orderBy: { createdAt: "desc" }, include: { order: { select: { orderNumber: true } } } }),
  ]);
  return (
    <div className="space-y-6">
      <section>
        <h1 className="mb-4 text-xl font-extrabold">Returns</h1>
        {returns.length === 0 ? (
          <EmptyState icon={<RotateCcw />} title="No returns" description="You can request a return from a delivered order's page." />
        ) : (
          <Card className="divide-y divide-line">
            {returns.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-3 p-4 text-sm">
                <div className="flex-1">
                  <Link href={`/account/orders/${r.order.orderNumber}`} className="font-bold hover:text-brand-700">{r.order.orderNumber}</Link>
                  <p className="text-xs text-muted">{formatDate(r.createdAt)} · {r.reason}</p>
                  <p className="text-xs text-muted">{r.items.map((ri) => `${r.order.items.find((i) => i.id === ri.orderItemId)?.name ?? "Item"} × ${ri.quantity}`).join(", ")}</p>
                  {r.adminNote && <p className="text-xs">Note: {r.adminNote}</p>}
                </div>
                <Badge tone={r.status === "REJECTED" ? "red" : r.status === "REFUNDED" ? "blue" : "orange"}>{RETURN_STATUS_LABEL[r.status]}</Badge>
              </div>
            ))}
          </Card>
        )}
      </section>
      <section>
        <h2 className="mb-4 text-lg font-extrabold">Refunds</h2>
        {refunds.length === 0 ? <Card className="p-4 text-sm text-muted">No refunds.</Card> : (
          <Card className="divide-y divide-line">
            {refunds.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 p-4 text-sm">
                <div>
                  <Link href={`/account/orders/${r.order.orderNumber}`} className="font-bold hover:text-brand-700">{r.order.orderNumber}</Link>
                  <p className="text-xs text-muted">{formatDate(r.createdAt)} · {r.mode === "RAZORPAY" ? "To original payment method" : "Bank / UPI transfer"}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold">{formatINR(r.amount)}</p>
                  <Badge tone={r.status === "PROCESSED" ? "blue" : r.status === "FAILED" ? "red" : "purple"}>{r.status === "PROCESSED" ? "Refund Completed" : r.status === "FAILED" ? "Failed" : "Refund Processing"}</Badge>
                </div>
              </div>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}
