"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LifeBuoy, RotateCcw, XCircle } from "lucide-react";
import { toast } from "sonner";
import { cancelMyOrderAction, raiseSupportRequestAction, requestReturnAction } from "@/actions/account";
import { retryPaymentAction } from "@/actions/checkout";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { payWithRazorpay } from "./razorpay";

const RETURN_REASONS = ["Damaged or defective", "Wrong item delivered", "Size or fit issue", "Not as described", "Quality not as expected", "Other"];

export function OrderActions({
  orderNumber, canRetry, canCancel, canReturn, returnable, paid,
}: { orderNumber: string; canRetry: boolean; canCancel: boolean; canReturn: boolean; returnable: { id: string; name: string; max: number }[]; paid: boolean }) {
  const router = useRouter();
  const [retrying, startRetry] = useTransition();
  const [cancelReason, setCancelReason] = useState("");
  const [returnOpen, setReturnOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [qty, setQty] = useState<Record<string, number>>(Object.fromEntries(returnable.map((r) => [r.id, r.max])));
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <div className="flex flex-wrap gap-2">
      {canRetry && (
        <Button
          variant="accent"
          loading={retrying}
          onClick={() =>
            startRetry(async () => {
              const res = await retryPaymentAction(orderNumber);
              if (!res.ok) { toast.error(res.error); router.refresh(); return; }
              await payWithRazorpay(res.data, {
                onVerified: (on) => router.push(`/checkout/success/${on}`),
                onFailed: (m) => { toast.error(m); router.refresh(); },
                onDismiss: () => router.refresh(),
              });
            })
          }
        >
          Retry payment
        </Button>
      )}
      {canCancel && (
        <ConfirmDialog
          trigger={<Button variant="outline"><XCircle /> Cancel order</Button>}
          title="Cancel this order?"
          description={paid ? "Your online payment will be refunded to the original payment method automatically." : "Reserved items will be released."}
          confirmLabel="Cancel order"
          destructive
          onConfirm={async () => {
            const res = await cancelMyOrderAction(orderNumber, cancelReason || "Changed my mind");
            if (!res.ok) toast.error(res.error);
            else { toast.success("Order cancelled"); router.refresh(); }
          }}
        >
          <Field label="Reason (optional)"><Input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="e.g. ordered by mistake" /></Field>
        </ConfirmDialog>
      )}
      {canReturn && (
        <Dialog open={returnOpen} onOpenChange={setReturnOpen}>
          <DialogTrigger asChild><Button variant="outline"><RotateCcw /> Return items</Button></DialogTrigger>
          <DialogContent title="Request a return" description="Choose items and tell us what went wrong.">
            <div className="space-y-4">
              {returnable.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="line-clamp-2">{r.name}</span>
                  <Select className="w-20" value={qty[r.id] ?? 0} onChange={(e) => setQty((q) => ({ ...q, [r.id]: Number(e.target.value) }))} aria-label={`Quantity of ${r.name} to return`}>
                    {Array.from({ length: r.max + 1 }, (_, i) => <option key={i} value={i}>{i}</option>)}
                  </Select>
                </div>
              ))}
              <Field label="Reason">
                <Select value={reason} onChange={(e) => setReason(e.target.value)}>
                  <option value="">Choose a reason</option>
                  {RETURN_REASONS.map((r) => <option key={r}>{r}</option>)}
                </Select>
              </Field>
              <Field label="Details (optional)"><Textarea value={details} onChange={(e) => setDetails(e.target.value)} /></Field>
              <Button
                className="w-full"
                loading={busy}
                disabled={!reason}
                onClick={async () => {
                  setBusy(true);
                  const res = await requestReturnAction({ orderNumber, reason, details, items: Object.entries(qty).map(([orderItemId, quantity]) => ({ orderItemId, quantity })) });
                  setBusy(false);
                  if (!res.ok) { toast.error(res.error); return; }
                  toast.success("Return requested. We'll review it shortly.");
                  setReturnOpen(false);
                  router.refresh();
                }}
              >
                Submit return request
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
      <Dialog open={supportOpen} onOpenChange={setSupportOpen}>
        <DialogTrigger asChild><Button variant="ghost"><LifeBuoy /> Need help?</Button></DialogTrigger>
        <DialogContent title="Contact support" description={`About order ${orderNumber}`}>
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              const msg = String(new FormData(e.currentTarget).get("message"));
              const res = await raiseSupportRequestAction({ orderNumber, message: msg });
              setBusy(false);
              if (!res.ok) { toast.error(res.error); return; }
              toast.success(res.message ?? "Sent");
              setSupportOpen(false);
            }}
          >
            <Textarea name="message" placeholder="Describe the issue" required minLength={10} />
            <Button type="submit" className="w-full" loading={busy}>Send</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
