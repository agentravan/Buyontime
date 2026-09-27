import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { formatDate, pageParam } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Pagination } from "@/components/status";
import { PageHeader } from "@/components/admin/ui";
import { MarkAdminRead } from "@/components/admin/mark-admin-read";
import { requireStaffPage } from "@/server/admin-guard";

export const metadata: Metadata = { title: "Notifications" };

export default async function AdminNotificationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireStaffPage("notifications:view");
  const page = pageParam((await searchParams).page);
  const take = 30;
  const [items, total, unread] = await Promise.all([
    db.notification.findMany({ where: { audience: "ADMIN" }, orderBy: { createdAt: "desc" }, skip: (page - 1) * take, take }),
    db.notification.count({ where: { audience: "ADMIN" } }),
    db.notification.count({ where: { audience: "ADMIN", readAt: null } }),
  ]);
  return (
    <div>
      <PageHeader title="Notification centre" description="New orders, payments, failures, low stock, returns, refunds and complaints — updated live." actions={unread > 0 ? <MarkAdminRead /> : undefined} />
      <Card className="divide-y divide-line">
        {items.length === 0 && <p className="p-6 text-center text-sm text-muted">No notifications yet.</p>}
        {items.map((n) => (
          <Link key={n.id} href={n.link ?? "#"} className={`flex items-start gap-3 p-4 hover:bg-slate-50 ${n.readAt ? "" : "bg-brand-50/40"}`}>
            <span className={`mt-1.5 size-2 shrink-0 rounded-full ${n.readAt ? "bg-transparent" : "bg-saffron-500"}`} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">🔔 {n.title}</p>
              <p className="text-sm text-slate-600">{n.body}</p>
            </div>
            <span className="shrink-0 text-xs text-muted">{formatDate(n.createdAt, true)}</span>
          </Link>
        ))}
      </Card>
      <Pagination page={page} totalPages={Math.ceil(total / take)} basePath="/admin/notifications" params={{}} />
    </div>
  );
}
