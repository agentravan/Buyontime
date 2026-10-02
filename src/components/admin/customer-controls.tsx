"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { addCustomerNoteAction, adjustWalletAction, issueVoucherCodeAction, resolveNoteAction, setCustomerStatusAction, setVoucherSpinsAction } from "@/actions/admin/operations";
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

type SpinRow = { id: string; prize: string; granted: boolean; couponCode: string | null; couponUsed: boolean; voucherAmount: number | null; voucherCode: string | null; revealed: boolean; createdAt: string };

function VoucherCodeForm({ spinId, initial }: { spinId: string; initial: string | null }) {
  const router = useRouter();
  const [code, setCode] = useState(initial ?? "");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="mt-1.5 flex flex-wrap gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const res = await issueVoucherCodeAction(spinId, code);
        setBusy(false);
        if (!res.ok) toast.error(res.error); else { toast.success(res.message ?? "Saved"); router.refresh(); }
      }}
    >
      <Input className="max-w-xs font-mono" placeholder="Gift voucher code you purchased" value={code} onChange={(e) => setCode(e.target.value)} aria-label="Gift voucher code" />
      <Button type="submit" size="sm" className="h-10" loading={busy}>{initial ? "Update code" : "Send code to customer"}</Button>
    </form>
  );
}

/** Spin & Win history for one customer, plus the gift-voucher controls. */
export function SpinRewardsCard({ userId, voucherSpins, spins, canManage, voucherAmount }: { userId: string; voucherSpins: number; spins: SpinRow[]; canManage: boolean; voucherAmount: number }) {
  const router = useRouter();
  const [count, setCount] = useState(String(voucherSpins));
  const [busy, setBusy] = useState(false);
  return (
    <Card className="space-y-3 p-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-bold">Spin &amp; Win</p>
        <Badge tone="gray">{spins.length} spin(s)</Badge>
        {voucherSpins > 0 && <Badge tone="purple">{voucherSpins} gift-voucher spin(s) waiting</Badge>}
      </div>
      {spins.length > 0 && (
        <ul className="space-y-2">
          {spins.map((s) => (
            <li key={s.id} className="rounded-xl border border-line p-2.5">
              <p>
                <span className="text-xs text-muted">{formatDate(s.createdAt)} · </span>
                {s.prize === "GIFT_VOUCHER" ? (
                  <><b>Amazon gift voucher ₹{Math.round((s.voucherAmount ?? 0) / 100)}</b> {s.granted ? "(given by you)" : "(earned by delivered orders)"} · {s.revealed ? "scratched" : "not scratched yet"} · {s.voucherCode ? "code sent" : <span className="font-semibold text-red-600">code not sent yet</span>}</>
                ) : (
                  <><b>{s.prize.replace(/_/g, " ").toLowerCase()}</b>{s.couponCode ? <> — <span className="font-mono">{s.couponCode}</span> ({s.couponUsed ? "used" : "not used"})</> : null}</>
                )}
              </p>
              {s.prize === "GIFT_VOUCHER" && canManage && <VoucherCodeForm spinId={s.id} initial={s.voucherCode} />}
            </li>
          ))}
        </ul>
      )}
      {canManage && (
        <form
          className="space-y-1"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const res = await setVoucherSpinsAction(userId, Number(count));
            setBusy(false);
            if (!res.ok) toast.error(res.error); else { toast.success(res.message ?? "Updated"); router.refresh(); }
          }}
        >
          <label className="block text-xs font-semibold" htmlFor="voucher-spins">Gift-voucher spins waiting for this account</label>
          <div className="flex gap-2">
            <Input id="voucher-spins" className="w-24" inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value)} />
            <Button type="submit" size="sm" className="h-10" loading={busy}>Save</Button>
          </div>
          <p className="text-xs text-muted">Each one is a spin that lands on the Amazon ₹{Math.round(voucherAmount / 100)} gift voucher — for partner creators you choose. Set 3 to give three vouchers. Each costs you one voucher.</p>
        </form>
      )}
    </Card>
  );
}

/** Wallet balance with a small form to add or take money (for returns, goodwill or corrections). */
export function WalletAdjustCard({ userId, balance, canManage }: { userId: string; balance: number; canManage: boolean }) {
  const router = useRouter();
  const [rupees, setRupees] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Card className="space-y-2 p-4 text-sm">
      <p className="font-bold">Wallet: ₹{(balance / 100).toLocaleString("en-IN")}</p>
      {canManage && (
        <form
          className="flex flex-wrap items-start gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const res = await adjustWalletAction(userId, { rupees: Number(rupees), note });
            setBusy(false);
            if (!res.ok) { toast.error(res.error); return; }
            toast.success(res.message ?? "Wallet updated"); setRupees(""); setNote(""); router.refresh();
          }}
        >
          <Input className="w-28" inputMode="decimal" placeholder="₹ +50 / -50" value={rupees} onChange={(e) => setRupees(e.target.value)} aria-label="Amount in rupees (negative to take money)" />
          <Input className="min-w-48 flex-1" placeholder="Why? (e.g. wallet part of returned order)" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Reason" />
          <Button type="submit" size="sm" className="h-10" loading={busy}>Apply</Button>
        </form>
      )}
      <p className="text-xs text-muted">Wallet money is returned automatically when an order is cancelled. For a returned or refused (RTO) order, add the wallet part back here if it is due.</p>
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
