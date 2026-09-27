import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { formatDate, pageParam, strParam } from "@/lib/utils";
import { Pagination } from "@/components/status";
import { FilterBar, FilterField, PageHeader, Table, inputCls } from "@/components/admin/ui";
import { requireStaffPage } from "@/server/admin-guard";

export const metadata: Metadata = { title: "Audit log" };

function fmt(v: Prisma.JsonValue | null) {
  if (v === null || v === undefined) return "—";
  const s = JSON.stringify(v, (k, val) => (typeof val === "number" && /price|mrp|cost|amount|fee|total/i.test(k) ? `${val} (₹${(val / 100).toFixed(2)})` : val));
  return s.length > 400 ? `${s.slice(0, 400)}…` : s;
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireStaffPage("audit:view");
  const sp = await searchParams;
  const action = strParam(sp.action);
  const entity = strParam(sp.entity);
  const page = pageParam(sp.page);
  const take = 40;
  const where: Prisma.AuditLogWhereInput = {
    ...(action ? { action: { contains: action } } : {}),
    ...(entity ? { OR: [{ entityType: entity }, { entityId: entity }] } : {}),
  };
  const [logs, total] = await Promise.all([
    db.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * take, take }),
    db.auditLog.count({ where }),
  ]);
  return (
    <div>
      <PageHeader title="Audit log" description="Append-only record of price, stock, order, refund, reconciliation, customer and settings changes." />
      <FilterBar action="/admin/audit">
        <FilterField label="Action contains"><input name="action" defaultValue={action} placeholder="e.g. price, refund, status" className={inputCls} /></FilterField>
        <FilterField label="Entity type or ID"><input name="entity" defaultValue={entity} placeholder="Product, Order, …" className={inputCls} /></FilterField>
      </FilterBar>
      <Table>
        <thead><tr><th>When</th><th>Admin</th><th>Action</th><th>Entity</th><th>Old value</th><th>New value</th></tr></thead>
        <tbody>
          {logs.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-muted">No entries.</td></tr>}
          {logs.map((l) => (
            <tr key={l.id} className="align-top">
              <td className="whitespace-nowrap text-xs">{formatDate(l.createdAt, true)}</td>
              <td className="text-xs">{l.actorEmail ?? "system"}</td>
              <td className="font-mono text-xs font-semibold">{l.action}</td>
              <td className="text-xs">{l.entityType}<br /><span className="font-mono text-[10px] text-muted">{l.entityId}</span></td>
              <td className="max-w-72 break-all font-mono text-[11px] text-red-700">{fmt(l.oldValue)}</td>
              <td className="max-w-72 break-all font-mono text-[11px] text-emerald-700">{fmt(l.newValue)}</td>
            </tr>
          ))}
        </tbody>
      </Table>
      <Pagination page={page} totalPages={Math.ceil(total / take)} basePath="/admin/audit" params={{ action, entity }} />
    </div>
  );
}
