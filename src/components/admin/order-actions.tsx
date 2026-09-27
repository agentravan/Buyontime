"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Banknote, CheckCircle2, RotateCcw, Truck } from "lucide-react";
import { toast } from "sonner";
import type { OrderStatus, PaymentMethod, PaymentStatus } from "@prisma/client";
import { clearAttentionAction, markCodCollectedAction, refundOrderAction, updateOrderStatusAction, updateShipmentAction } from "@/actions/admin/operations";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog, Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { formatINR } from "@/lib/money";
import { ORDER_STATUS_LABEL } from "@/lib/order-status";

export function OrderAdminActions({
  orderId, status, nextStatuses, paymentMethod, paymentStatus, shipment, canUpdate, canCollect, canRefund, refundable, needsAttention,
}: {
  orderId: string;
  status: OrderStatus;
  nextStatuses: OrderStatus[];
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  shipment: { courier: string; trackingId: string; trackingUrl: string; actualCost: number | null };
  canUpdate: boolean;
  canCollect: boolean;
  canRefund: boolean;
  refundable: number;
  needsAttention: boolean;
}) {
  const router = useRouter();
  const [target, setTarget] = useState<OrderStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [shipOpen, setShipOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [codRef, setCodRef] = useState("");

  const done = (res: { ok: boolean; error?: string; message?: string }) => {
    if (!res.ok) toast.error(res.error);
    else { toast.success(res.message ?? "Saved"); router.refresh(); }
    return res.ok;
  };

  const shipFields = (
    <>
      <Field label="Courier" htmlFor="s-courier"><Input id="s-courier" name="courier" defaultValue={shipment.courier} placeholder="e.g. Delhivery, Blue Dart" /></Field>
      <Field label="Tracking number" htmlFor="s-tid"><Input id="s-tid" name="trackingId" defaultValue={shipment.trackingId} /></Field>
      <Field label="Tracking URL" htmlFor="s-url"><Input id="s-url" name="trackingUrl" defaultValue={shipment.trackingUrl} placeholder="https://…" /></Field>
      <Field label="Actual shipping cost (₹, optional)" htmlFor="s-cost" hint="Used in profit instead of the per-product estimate"><Input id="s-cost" name="shippingCost" inputMode="decimal" defaultValue={shipment.actualCost !== null ? String(shipment.actualCost / 100) : ""} /></Field>
      <Field label="Estimated delivery (optional)" htmlFor="s-eta"><Input id="s-eta" name="estimatedDelivery" type="date" /></Field>
    </>
  );

  const readShip = (fd: FormData) => ({
    courier: String(fd.get("courier") ?? ""), trackingId: String(fd.get("trackingId") ?? ""), trackingUrl: String(fd.get("trackingUrl") ?? ""),
    shippingCost: String(fd.get("shippingCost") ?? ""), estimatedDelivery: String(fd.get("estimatedDelivery") ?? ""),
  });

  const hasAny = (canUpdate && (nextStatuses.length > 0 || status !== "PENDING_PAYMENT")) || (canCollect && paymentMethod === "COD") || (canRefund && refundable > 0) || needsAttention;
  if (!hasAny) return null;

  return (
    <Card className="flex flex-wrap items-center gap-2 p-3">
      {canUpdate && nextStatuses.filter((s) => s !== "CANCELLED").map((s) => (
        <Button key={s} size="sm" variant={s === "RTO" ? "outline" : "default"} onClick={() => setTarget(s)}>
          {s === "SHIPPED" ? <Truck /> : <CheckCircle2 />} Mark {ORDER_STATUS_LABEL[s].toLowerCase()}
        </Button>
      ))}
      {canUpdate && nextStatuses.includes("CANCELLED") && (
        <ConfirmDialog
          trigger={<Button size="sm" variant="outline" className="text-red-600">Cancel order</Button>}
          title="Cancel this order?"
          description={paymentStatus === "PAID" && paymentMethod === "ONLINE" ? "Stock is released and the online payment is refunded automatically via Razorpay." : "Reserved stock is released and the customer is notified."}
          destructive
          confirmLabel="Cancel order"
          onConfirm={async () => { done(await updateOrderStatusAction(orderId, { status: "CANCELLED", note: "Cancelled by store" })); }}
        />
      )}
      {canUpdate && !["PENDING_PAYMENT", "CANCELLED"].includes(status) && (
        <Dialog open={shipOpen} onOpenChange={setShipOpen}>
          <DialogTrigger asChild><Button size="sm" variant="outline"><Truck /> Courier & tracking</Button></DialogTrigger>
          <DialogContent title="Courier & tracking">
            <form className="space-y-3" onSubmit={async (e) => {
              e.preventDefault(); setBusy(true);
              const ok = done(await updateShipmentAction(orderId, readShip(new FormData(e.currentTarget))));
              setBusy(false); if (ok) setShipOpen(false);
            }}>
              {shipFields}
              <Button type="submit" className="w-full" loading={busy}>Save</Button>
            </form>
          </DialogContent>
        </Dialog>
      )}
      {canCollect && paymentMethod === "COD" && paymentStatus === "PENDING" && ["SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED"].includes(status) && (
        <ConfirmDialog
          trigger={<Button size="sm" variant="secondary"><Banknote /> Mark COD collected</Button>}
          title="Mark cash as collected?"
          description="Use this once the courier has collected (or remitted) the COD amount. This is recorded in the audit log."
          confirmLabel="Mark collected"
          onConfirm={async () => { done(await markCodCollectedAction(orderId, codRef)); }}
        >
          <Field label="Remittance / UTR reference (optional)"><Input value={codRef} onChange={(e) => setCodRef(e.target.value)} /></Field>
        </ConfirmDialog>
      )}
      {canRefund && refundable > 0 && (
        <Dialog open={refundOpen} onOpenChange={setRefundOpen}>
          <DialogTrigger asChild><Button size="sm" variant="outline"><RotateCcw /> Refund</Button></DialogTrigger>
          <DialogContent title="Issue a refund" description={`Up to ${formatINR(refundable)} can be refunded.`}>
            <form className="space-y-3" onSubmit={async (e) => {
              e.preventDefault(); setBusy(true);
              const fd = new FormData(e.currentTarget);
              const ok = done(await refundOrderAction(orderId, { amount: String(fd.get("amount")), reason: String(fd.get("reason")), reference: String(fd.get("reference") ?? "") }));
              setBusy(false); if (ok) setRefundOpen(false);
            }}>
              <Field label="Amount (₹)"><Input name="amount" inputMode="decimal" defaultValue={String(refundable / 100)} required /></Field>
              <Field label="Reason"><Input name="reason" required placeholder="e.g. Item damaged in transit" /></Field>
              {paymentMethod === "COD" ? (
                <Field label="Bank / UPI transaction reference" hint="COD refunds are paid manually; record the transfer reference here."><Input name="reference" required /></Field>
              ) : (
                <p className="rounded-lg bg-sky-50 p-2 text-xs text-sky-800">The refund is sent through the Razorpay Refund API to the customer&apos;s original payment method. Status updates automatically via webhook.</p>
              )}
              <Button type="submit" variant="destructive" className="w-full" loading={busy}>Refund</Button>
            </form>
          </DialogContent>
        </Dialog>
      )}
      {needsAttention && canUpdate && (
        <Button size="sm" variant="ghost" onClick={async () => done(await clearAttentionAction(orderId))}>Mark attention handled</Button>
      )}

      <Dialog open={target !== null} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent title={target ? `Mark order ${ORDER_STATUS_LABEL[target].toLowerCase()}` : ""} description="The customer is notified automatically.">
          {target && (
            <form className="space-y-3" onSubmit={async (e) => {
              e.preventDefault(); setBusy(true);
              const fd = new FormData(e.currentTarget);
              const ok = done(await updateOrderStatusAction(orderId, { status: target as "CONFIRMED", ...readShip(fd), note: String(fd.get("note") ?? "") }));
              setBusy(false); if (ok) setTarget(null);
            }}>
              {target === "SHIPPED" && shipFields}
              {target === "RTO" && <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">RTO puts the units back into sellable stock and cancels an uncollected COD payment.</p>}
              <Field label="Note (optional)"><Input name="note" /></Field>
              <Button type="submit" className="w-full" loading={busy}>Confirm</Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
