import type { Metadata } from "next";
import Link from "next/link";
import { Bell } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/utils";
import { Card, EmptyState } from "@/components/ui/card";

export const metadata: Metadata = { title: "Notifications", robots: { index: false } };

export default async function NotificationsPage() {
  const user = await requireUser();
  const items = await db.notification.findMany({ where: { audience: "CUSTOMER", userId: user.id }, orderBy: { createdAt: "desc" }, take: 60 });
  const unread = items.filter((i) => !i.readAt).length;
  // Viewing the inbox marks everything as read (the list above still highlights what was new).
  if (unread > 0) await db.notification.updateMany({ where: { audience: "CUSTOMER", userId: user.id, readAt: null }, data: { readAt: new Date() } });
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-extrabold">Notifications</h1>
        {unread > 0 && <span className="text-sm text-muted">{unread} new</span>}
      </div>
      {items.length === 0 ? <EmptyState icon={<Bell />} title="No notifications yet" description="Order, payment and delivery updates will appear here." /> : (
        <Card className="divide-y divide-line">
          {items.map((n) => (
            <Link key={n.id} href={n.link ?? "#"} className={`block p-4 hover:bg-slate-50 ${n.readAt ? "" : "bg-brand-50/40"}`}>
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-bold">{!n.readAt && <span className="mr-1.5 inline-block size-2 rounded-full bg-saffron-500" />}{n.title}</p>
                <span className="shrink-0 text-xs text-muted">{formatDate(n.createdAt, true)}</span>
              </div>
              <p className="mt-0.5 text-sm text-slate-600">{n.body}</p>
            </Link>
          ))}
        </Card>
      )}
    </div>
  );
}
