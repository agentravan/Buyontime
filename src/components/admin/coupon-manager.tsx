"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { saveCouponAction, toggleCouponAction } from "@/actions/admin/operations";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select } from "@/components/ui/input";
import { Table } from "@/components/admin/ui";
import { formatINR } from "@/lib/money";
import { formatDate } from "@/lib/utils";

type Coupon = { id: string; code: string; description: string; type: "PERCENTAGE" | "FIXED"; value: number; minOrder: number; maxDiscount: number | null; expiresAt: string | null; usageLimit: number | null; perUserLimit: number; usedCount: number; isActive: boolean };

export function CouponManager({ coupons }: { coupons: Coupon[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Coupon | "new" | null>(null);
  const [type, setType] = useState<"PERCENTAGE" | "FIXED">("PERCENTAGE");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
  const current = editing && editing !== "new" ? editing : null;
  const open = (c: Coupon | "new") => { setEditing(c); setType(c === "new" ? "PERCENTAGE" : c.type); setErrors({}); };

  return (
    <div className="space-y-3">
      <Button onClick={() => open("new")}><Plus /> New coupon</Button>
      <Table>
        <thead><tr><th>Code</th><th>Discount</th><th>Min order</th><th>Max discount</th><th>Expires</th><th>Used</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {coupons.length === 0 && <tr><td colSpan={8} className="py-8 text-center text-muted">No coupons yet.</td></tr>}
          {coupons.map((c) => {
            const expired = c.expiresAt && new Date(c.expiresAt) < new Date();
            return (
              <tr key={c.id}>
                <td><span className="font-mono font-bold">{c.code}</span>{c.description && <p className="text-xs text-muted">{c.description}</p>}</td>
                <td>{c.type === "PERCENTAGE" ? `${c.value}%` : formatINR(c.value)}</td>
                <td>{c.minOrder ? formatINR(c.minOrder) : "—"}</td>
                <td>{c.maxDiscount ? formatINR(c.maxDiscount) : "—"}</td>
                <td className="text-xs">{c.expiresAt ? formatDate(c.expiresAt) : "Never"}</td>
                <td>{c.usedCount}{c.usageLimit ? ` / ${c.usageLimit}` : ""}</td>
                <td>{expired ? <Badge tone="gray">Expired</Badge> : <Badge tone={c.isActive ? "green" : "gray"}>{c.isActive ? "Active" : "Inactive"}</Badge>}</td>
                <td className="space-x-1 whitespace-nowrap">
                  <Button size="sm" variant="outline" onClick={() => open(c)}>Edit</Button>
                  <Button size="sm" variant="ghost" onClick={async () => { const r = await toggleCouponAction(c.id, !c.isActive); if (!r.ok) toast.error(r.error); router.refresh(); }}>{c.isActive ? "Deactivate" : "Activate"}</Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </Table>
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent title={current ? `Edit ${current.code}` : "New coupon"}>
          {editing !== null && (
            <form className="grid gap-3 sm:grid-cols-2" onSubmit={async (e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              setBusy(true);
              const res = await saveCouponAction({
                code: fd.get("code"), description: fd.get("description"), type, value: fd.get("value"),
                minOrder: fd.get("minOrder") || "0", maxDiscount: type === "PERCENTAGE" && fd.get("maxDiscount") ? fd.get("maxDiscount") : null,
                expiresAt: fd.get("expiresAt"), usageLimit: fd.get("usageLimit") ? fd.get("usageLimit") : null,
                perUserLimit: fd.get("perUserLimit") || "1", isActive: fd.get("isActive") === "on",
              }, current?.id);
              setBusy(false);
              if (!res.ok) { setErrors(res.fieldErrors ?? {}); toast.error(res.error); return; }
              toast.success("Coupon saved");
              setEditing(null);
              router.refresh();
            }}>
              <Field label="Code" error={errors.code}><Input name="code" defaultValue={current?.code} className="uppercase" required /></Field>
              <Field label="Discount type">
                <Select value={type} onChange={(e) => setType(e.target.value as "PERCENTAGE" | "FIXED")}><option value="PERCENTAGE">Percentage</option><option value="FIXED">Fixed amount</option></Select>
              </Field>
              <Field label={type === "PERCENTAGE" ? "Percentage off" : "Amount off (₹)"} error={errors.value}><Input name="value" inputMode="decimal" defaultValue={current ? String(current.type === "FIXED" ? current.value / 100 : current.value) : ""} required /></Field>
              {type === "PERCENTAGE" && <Field label="Maximum discount (₹, optional)" error={errors.maxDiscount}><Input name="maxDiscount" inputMode="decimal" defaultValue={current?.maxDiscount ? String(current.maxDiscount / 100) : ""} /></Field>}
              <Field label="Minimum order (₹)" error={errors.minOrder}><Input name="minOrder" inputMode="decimal" defaultValue={current ? String(current.minOrder / 100) : "0"} /></Field>
              <Field label="Expiry date (optional)"><Input name="expiresAt" type="date" defaultValue={current?.expiresAt ? current.expiresAt.slice(0, 10) : ""} /></Field>
              <Field label="Total usage limit (optional)"><Input name="usageLimit" inputMode="numeric" defaultValue={current?.usageLimit ? String(current.usageLimit) : ""} /></Field>
              <Field label="Uses per customer" hint="0 = unlimited"><Input name="perUserLimit" inputMode="numeric" defaultValue={String(current?.perUserLimit ?? 1)} /></Field>
              <Field label="Description (shown to customers)" className="sm:col-span-2"><Input name="description" defaultValue={current?.description} /></Field>
              <label className="flex items-center gap-2 text-sm sm:col-span-2"><Checkbox name="isActive" defaultChecked={current ? current.isActive : true} /> Active</label>
              <Button type="submit" className="sm:col-span-2" loading={busy}>Save coupon</Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
