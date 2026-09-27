import type { Metadata } from "next";
import Link from "next/link";
import { Package } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { pageParam } from "@/lib/utils";
import { EmptyState } from "@/components/ui/card";
import { Pagination } from "@/components/status";
import { OrderCard } from "@/components/store/account-widgets";

export const metadata: Metadata = { title: "My orders", robots: { index: false } };

export default async function OrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const page = pageParam((await searchParams).page);
  const take = 10;
  const [orders, total] = await Promise.all([
    db.order.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, skip: (page - 1) * take, take, include: { items: true } }),
    db.order.count({ where: { userId: user.id } }),
  ]);
  return (
    <div>
      <h1 className="mb-4 text-xl font-extrabold">My orders</h1>
      {orders.length === 0 ? (
        <EmptyState icon={<Package />} title="No orders yet" description="When you place an order it will show up here." action={<Link href="/products" className="rounded-xl bg-brand-700 px-5 py-2.5 text-sm font-semibold text-white">Shop now</Link>} />
      ) : (
        <div className="space-y-3">{orders.map((o) => <OrderCard key={o.id} order={o} />)}</div>
      )}
      <Pagination page={page} totalPages={Math.ceil(total / take)} basePath="/account/orders" params={{}} />
    </div>
  );
}
