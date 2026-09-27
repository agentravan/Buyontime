import type { Metadata } from "next";
import Link from "next/link";
import type { ReturnStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { formatINR } from "@/lib/money";
import { RETURN_STATUS_LABEL } from "@/lib/order-status";
import { can } from "@/lib/permissions";
import { formatDate, strParam } from "@/lib/utils";
import { Badge, Card, EmptyState } from "@/components/ui/card";
import { MethodBadge } from "@/components/status";
import { PageHeader } from "@/components/admin/ui";
import { ReturnActions } from "@/components/admin/return-actions";
import { requireStaffPage } from "@/server/admin-guard";

export const metadata: Metadata = { title: "Returns & refunds" };

const TABS: { key: string; label: string; statuses: ReturnStatus[] }[] = [
  { key: "open", label: "To process", statuses: ["REQUESTED", "APPROVED", "RECEIVED"] },
  { key: "refunding", label: "Refunding", statuses: ["REFUND_INITIATED"] },
  { key: "closed", label: "Closed", statuses: ["REFUNDED", "REJECTED"] },
];

export default async function ReturnsAdminPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireStaffPage("returns:manage");
  const tab = TABS.find((t) => t.key === strParam((await searchParams).tab)) ?? TABS[0];
  const returns = await db.returnRequest.findMany({
    where: { status: { in: tab.statuses } },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { items: true, order: { include: { items: true } }, user: { select: { name: true, phone: true } }, refunds: true },
  });
  return (
    <div>
      <PageHeader title="Returns & refunds" description="Approve → receive & inspect (choose condition per unit) → refund. Only resellable units go back to stock." />
      <div className="mb-4 flex gap-2">
        {TABS.map((t) => (
          <Link key={t.key} href={`/admin/returns?tab=${t.key}`} className={`rounded-full px-4 py-1.5 text-sm font-semibold ${t.key === tab.key ? "bg-brand-700 text-white" : "border border-line bg-white"}`}>{t.label}</Link>
        ))}
      </div>
      {returns.length === 0 ? <EmptyState title="Nothing here" description="Return requests from customers appear here." /> : (
        <div className="space-y-3">
          {returns.map((r) => (
            <Card key={r.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Link href={`/admin/orders/${r.orderId}`} className="font-bold text-brand-700 hover:underline">{r.order.orderNumber}</Link>
                  <span className="ml-2"><MethodBadge method={r.order.paymentMethod} /></span>
                  <p className="text-sm">{r.user.name} · {r.user.phone}</p>
                  <p className="text-xs text-muted">Requested {formatDate(r.createdAt, true)}</p>
                </div>
                <Badge tone={r.status === "REJECTED" ? "red" : r.status === "REFUNDED" ? "blue" : "orange"}>{RETURN_STATUS_LABEL[r.status]}</Badge>
              </div>
              <p className="mt-2 text-sm"><b>Reason:</b> {r.reason}{r.details ? ` — ${r.details}` : ""}</p>
              {r.adminNote && <p className="text-sm text-muted">Note: {r.adminNote}</p>}
              <ul className="mt-2 space-y-1 text-sm">
                {r.items.map((ri) => {
                  const oi = r.order.items.find((o) => o.id === ri.orderItemId);
                  return <li key={ri.id}>• {oi?.name} × {ri.quantity} {ri.condition && <Badge tone={ri.condition === "RESELLABLE" ? "green" : "red"}>{ri.condition.replace(/_/g, " ").toLowerCase()}</Badge>}</li>;
                })}
              </ul>
              {r.refundAmount > 0 && <p className="mt-2 text-sm">Refund due: <b>{formatINR(r.refundAmount)}</b>{r.refunds.length > 0 && ` · ${r.refunds.map((f) => `${formatINR(f.amount)} ${f.status.toLowerCase()}`).join(", ")}`}</p>}
              <ReturnActions
                returnId={r.id}
                status={r.status}
                items={r.items.map((ri) => ({ id: ri.id, name: r.order.items.find((o) => o.id === ri.orderItemId)?.name ?? "Item", quantity: ri.quantity }))}
                refundAmount={r.refundAmount}
                isCod={r.order.paymentMethod === "COD"}
                canRefund={can(user.role, "refunds:manage")}
              />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
