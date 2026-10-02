"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { addCustomerNoteAction, issueCreatorVoucherAction, resolveNoteAction, setCreatorRewardAction, setCustomerStatusAction } from "@/actions/admin/operations";
import { Badge, Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Input, Select, Textarea } from "@/components/ui/input";
import { formatDate } from "@/lib/utils";

export function CustomerControls({ userId, status, codBlocked }: { userId: string; status: "ACTIVE" | "BLOCKED"; codBlocked: boolean }) {
  const router = useRouter();
  const run = async (input: { status?: "ACTIVE" | "BLOCKED"; codBlocked?: boolean }) => {
    const res = await setCustomerStatusAction(userId, input);
    if (!res.ok) toast.error(res.error); else { toast.success(res.message ?? "Updated"); router.refresh(); }
  };
  return (
    <Card className="flex flex-wrap gap-2 p-3">
      <ConfirmDialog
        trigger={<Button size="sm" variant="outline">{codBlocked ? "Allow COD" : "Block COD for this customer"}</Button>}
        title={codBlocked ? "Allow Cash on Delivery again?" : "Block Cash on Delivery?"}
        description={codBlocked ? undefined : "Useful after repeated COD refusals (RTO). The customer can still pay online."}
        onConfirm={() => run({ codBlocked: !codBlocked })}
      />
      <ConfirmDialog
        trigger={<Button size="sm" variant={status === "ACTIVE" ? "outline" : "default"} className={status === "ACTIVE" ? "text-red-600" : ""}>{status === "ACTIVE" ? "Block account" : "Unblock account"}</Button>}
        title={status === "ACTIVE" ? "Block this account?" : "Unblock this account?"}
        description={status === "ACTIVE" ? "They will be signed out and cannot log in or order." : undefined}
        destructive={status === "ACTIVE"}
        onConfirm={() => run({ status: status === "ACTIVE" ? "BLOCKED" : "ACTIVE" })}
      />
    </Card>
  );
}

type SpinInfo = { prize: string; couponCode: string | null; couponUsed: boolean; voucherAmount: number | null; voucherCode: string | null; revealed: boolean; createdAt: string } | null;

/** Spin & Win status for one customer, plus the creator gift-voucher controls. */
export function CreatorRewardCard({ userId, eligible, spin, canManage, voucherAmount }: { userId: string; eligible: boolean; spin: SpinInfo; canManage: boolean; voucherAmount: number }) {
  const router = useRouter();
  const [code, setCode] = useState(spin?.voucherCode ?? "");
  const [busy, setBusy] = useState(false);
  const isCreatorWin = spin?.prize === "CREATOR_VOUCHER";
  const toggle = async () => {
    setBusy(true);
    const res = await setCreatorRewardAction(userId, !eligible);
    setBusy(false);
    if (!res.ok) toast.error(res.error); else { toast.success(res.message ?? "Updated"); router.refresh(); }
  };
  return (
    <Card className="space-y-3 p-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-bold">Spin &amp; Win</p>
        {eligible && <Badge tone="purple">Creator</Badge>}
        {!spin && <Badge tone="gray">Not spun yet</Badge>}
        {spin && <Badge tone="green">Spun {formatDate(spin.createdAt)}</Badge>}
      </div>
      {spin && !isCreatorWin && (
        <p>Won <b>{spin.prize.replace(/_/g, " ").toLowerCase()}</b>{spin.couponCode ? <> — coupon <span className="font-mono">{spin.couponCode}</span> ({spin.couponUsed ? "used" : "not used yet"})</> : null}</p>
      )}
      {isCreatorWin && (
        <div className="space-y-2">
          <p>Won the <b>creator gift voucher (₹{Math.round((spin.voucherAmount ?? 0) / 100)})</b> · {spin.revealed ? "card scratched" : "card not scratched yet"} · {spin.voucherCode ? "code sent" : "code not sent yet"}</p>
          {canManage && (
            <form
              className="flex flex-wrap gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                const res = await issueCreatorVoucherAction(userId, code);
                setBusy(false);
                if (!res.ok) toast.error(res.error); else { toast.success(res.message ?? "Saved"); router.refresh(); }
              }}
            >
              <Input className="max-w-xs font-mono" placeholder="Gift voucher code you purchased" value={code} onChange={(e) => setCode(e.target.value)} aria-label="Gift voucher code" />
              <Button type="submit" size="sm" className="h-10" loading={busy}>{spin.voucherCode ? "Update code" : "Send code to customer"}</Button>
            </form>
          )}
        </div>
      )}
      {canManage && !spin && (
        <div className="space-y-1">
          <Button size="sm" variant={eligible ? "outline" : "default"} onClick={toggle} loading={busy}>
            {eligible ? "Remove creator reward" : `Give creator reward (₹${Math.round(voucherAmount / 100)} gift voucher)`}
          </Button>
          <p className="text-xs text-muted">For partner creators only. Their single spin lands on the creator gift instead of a coupon. Other customers never see this prize on their wheel.</p>
        </div>
      )}
    </Card>
  );
}

type Note = { id: string; body: string; type: "NOTE" | "COMPLAINT" | "SUPPORT"; status: "OPEN" | "RESOLVED"; author: string; byCustomer: boolean; createdAt: string };

export function CustomerNotes({ userId, notes, canWrite }: { userId: string; notes: Note[]; canWrite: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <div>
      <p className="mb-2 text-sm font-bold">Notes & complaints</p>
      {canWrite && (
        <form
          className="mb-3 space-y-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const fd = new FormData(form);
            setBusy(true);
            const res = await addCustomerNoteAction(userId, { body: String(fd.get("body")), type: fd.get("type") as Note["type"] });
            setBusy(false);
            if (!res.ok) { toast.error(res.error); return; }
            form.reset();
            router.refresh();
          }}
        >
          <Textarea name="body" placeholder="Add an internal note (e.g. called customer about delivery)" className="min-h-16" required />
          <div className="flex gap-2">
            <Select name="type" className="w-40"><option value="NOTE">Note</option><option value="SUPPORT">Support</option><option value="COMPLAINT">Complaint</option></Select>
            <Button type="submit" size="sm" className="h-10" loading={busy}>Add</Button>
          </div>
        </form>
      )}
      {notes.length === 0 ? <p className="text-sm text-muted">No notes yet.</p> : (
        <ul className="space-y-2">
          {notes.map((n) => (
            <li key={n.id} className="rounded-xl border border-line p-3 text-sm">
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge tone={n.type === "COMPLAINT" ? "red" : n.type === "SUPPORT" ? "blue" : "gray"}>{n.type.toLowerCase()}</Badge>
                <Badge tone={n.status === "OPEN" ? "yellow" : "green"}>{n.status.toLowerCase()}</Badge>
                <span className="text-xs text-muted">{n.byCustomer ? "from customer" : n.author} · {formatDate(n.createdAt, true)}</span>
                {canWrite && n.status === "OPEN" && (
                  <button className="ml-auto text-xs font-semibold text-brand-700" onClick={async () => { await resolveNoteAction(n.id); router.refresh(); }}>Mark resolved</button>
                )}
              </div>
              <p className="mt-1 whitespace-pre-line">{n.body}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
