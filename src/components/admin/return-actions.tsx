"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ReturnStatus } from "@prisma/client";
import { decideReturnAction, receiveReturnAction, refundReturnAction } from "@/actions/admin/operations";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";

type Cond = "RESELLABLE" | "DAMAGED" | "RETURN_TO_SUPPLIER";

export function ReturnActions({ returnId, status, items, refundAmount, isCod, canRefund }: { returnId: string; status: ReturnStatus; items: { id: string; name: string; quantity: number }[]; refundAmount: number; isCod: boolean; canRefund: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<"receive" | "refund" | "reject" | null>(null);
  const [conds, setConds] = useState<Record<string, Cond>>(Object.fromEntries(items.map((i) => [i.id, "RESELLABLE"])));
  const done = (res: { ok: boolean; error?: string; message?: string }) => {
    if (!res.ok) toast.error(res.error); else { toast.success(res.message ?? "Done"); router.refresh(); setOpen(null); }
    setBusy(false);
  };
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {status === "REQUESTED" && (
        <>
          <Button size="sm" loading={busy} onClick={async () => { setBusy(true); done(await decideReturnAction(returnId, "APPROVED")); }}>Approve</Button>
          <Dialog open={open === "reject"} onOpenChange={(o) => setOpen(o ? "reject" : null)}>
            <DialogTrigger asChild><Button size="sm" variant="outline" className="text-red-600">Reject</Button></DialogTrigger>
            <DialogContent title="Reject return">
              <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); setBusy(true); done(await decideReturnAction(returnId, "REJECTED", String(new FormData(e.currentTarget).get("note")))); }}>
                <Field label="Reason shown to customer"><Input name="note" required /></Field>
                <Button type="submit" variant="destructive" className="w-full" loading={busy}>Reject return</Button>
              </form>
            </DialogContent>
          </Dialog>
        </>
      )}
      {status === "APPROVED" && (
        <Dialog open={open === "receive"} onOpenChange={(o) => setOpen(o ? "receive" : null)}>
          <DialogTrigger asChild><Button size="sm">Mark received & inspect</Button></DialogTrigger>
          <DialogContent title="Inspect returned items" description="Only resellable units are added back to sellable stock.">
            <form className="space-y-3" onSubmit={async (e) => {
              e.preventDefault(); setBusy(true);
              done(await receiveReturnAction(returnId, { conditions: items.map((i) => ({ returnItemId: i.id, condition: conds[i.id] })), returnShippingCost: String(new FormData(e.currentTarget).get("cost") ?? "") }));
            }}>
              {items.map((i) => (
                <Field key={i.id} label={`${i.name} × ${i.quantity}`}>
                  <Select value={conds[i.id]} onChange={(e) => setConds((c) => ({ ...c, [i.id]: e.target.value as Cond }))}>
                    <option value="RESELLABLE">Resellable — back to stock</option>
                    <option value="DAMAGED">Damaged — write off</option>
                    <option value="RETURN_TO_SUPPLIER">Return to supplier</option>
                  </Select>
                </Field>
              ))}
              <Field label="Return shipping cost (₹, optional)"><Input name="cost" inputMode="decimal" /></Field>
              <Button type="submit" className="w-full" loading={busy}>Confirm receipt</Button>
            </form>
          </DialogContent>
        </Dialog>
      )}
      {status === "RECEIVED" && canRefund && (
        <Dialog open={open === "refund"} onOpenChange={(o) => setOpen(o ? "refund" : null)}>
          <DialogTrigger asChild><Button size="sm" variant="accent">Refund customer</Button></DialogTrigger>
          <DialogContent title="Refund return">
            <form className="space-y-3" onSubmit={async (e) => {
              e.preventDefault(); setBusy(true);
              const fd = new FormData(e.currentTarget);
              done(await refundReturnAction(returnId, { amount: String(fd.get("amount")), reference: String(fd.get("reference") ?? "") }));
            }}>
              <Field label="Amount (₹)"><Input name="amount" defaultValue={String(refundAmount / 100)} inputMode="decimal" required /></Field>
              {isCod ? <Field label="Bank / UPI reference" hint="COD refunds are paid manually"><Input name="reference" required /></Field> : <p className="text-xs text-muted">Refunded via Razorpay to the original payment method.</p>}
              <Button type="submit" className="w-full" loading={busy}>Issue refund</Button>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
