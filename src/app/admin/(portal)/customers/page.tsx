import type { Metadata } from "next";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { formatINR } from "@/lib/money";
import { getSettings } from "@/lib/settings";
import { formatDate, pageParam, strParam } from "@/lib/utils";
import { Badge } from "@/components/ui/card";
import { Pagination } from "@/components/status";
import { FilterBar, FilterField, PageHeader, Table, inputCls } from "@/components/admin/ui";
import { requireStaffPage } from "@/server/admin-guard";

export const metadata: Metadata = { title: "Customers" };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireStaffPage("customers:view");
  const sp = await searchParams;
  const q = strParam(sp.q);
  const status = strParam(sp.status);
  const page = pageParam(sp.page);
  const take = 25;
  const where: Prisma.UserWhereInput = {
    role: "CUSTOMER",
    ...(status === "ACTIVE" || status === "BLOCKED" ? { status } : {}),
    ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }] } : {}),
  };
  const [users, total, settings] = await Promise.all([
    db.user.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * take, take, select: { id: true, name: true, email: true, phone: true, status: true, codBlocked: true, createdAt: true } }),
    db.user.count({ where }),
    getSettings(),
  ]);
  const ids = users.map((u) => u.id);
  const stats = ids.length
    ? await db.order.groupBy({ by: ["userId"], where: { userId: { in: ids }, status: { notIn: ["PENDING_PAYMENT", "CANCELLED", "RTO"] } }, _count: { _all: true }, _sum: { total: true }, _max: { createdAt: true } })
    : [];
  const byUser = new Map(stats.map((s) => [s.userId, s]));

  return (
    <div>
      <PageHeader title="Customers" description={`${total.toLocaleString("en-IN")} customers`} />
      <FilterBar action="/admin/customers">
        <FilterField label="Search" className="min-w-52 flex-1"><input name="q" defaultValue={q} placeholder="Name, email or phone" className={inputCls} /></FilterField>
        <FilterField label="Account"><select name="status" defaultValue={status ?? ""} className={inputCls}><option value="">All</option><option value="ACTIVE">Active</option><option value="BLOCKED">Blocked</option></select></FilterField>
      </FilterBar>
      <Table>
        <thead><tr><th>Customer</th><th>Email</th><th>Phone</th><th className="text-right">Orders</th><th className="text-right">Total spend</th><th>Last order</th><th>Account</th></tr></thead>
        <tbody>
          {users.length === 0 && <tr><td colSpan={7} className="py-10 text-center text-muted">No customers found.</td></tr>}
          {users.map((u) => {
            const s = byUser.get(u.id);
            const spend = s?._sum.total ?? 0;
            return (
              <tr key={u.id}>
                <td><Link href={`/admin/customers/${u.id}`} className="font-semibold text-brand-700 hover:underline">{u.name}</Link>{spend >= settings.vipLifetimeSpend && <span className="ml-1.5"><Badge tone="purple">VIP</Badge></span>}<p className="text-xs text-muted">Since {formatDate(u.createdAt)}</p></td>
                <td className="text-xs">{u.email}</td>
                <td className="text-xs">{u.phone ?? "—"}</td>
                <td className="text-right">{s?._count._all ?? 0}</td>
                <td className="text-right font-semibold">{formatINR(spend)}</td>
                <td className="text-xs">{s?._max.createdAt ? formatDate(s._max.createdAt) : "—"}</td>
                <td className="space-x-1"><Badge tone={u.status === "ACTIVE" ? "green" : "red"}>{u.status.toLowerCase()}</Badge>{u.codBlocked && <Badge tone="orange">COD blocked</Badge>}</td>
              </tr>
            );
          })}
        </tbody>
      </Table>
      <Pagination page={page} totalPages={Math.ceil(total / take)} basePath="/admin/customers" params={{ q, status }} />
    </div>
  );
}
