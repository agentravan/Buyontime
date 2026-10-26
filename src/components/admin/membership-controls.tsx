"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { applyMemberPricingAction, cancelMemberRewardAction, cancelMembershipAction, sendMemberRewardAction, syncMemberRewardsAction } from "@/actions/admin/membership";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";

export function SendRewardForm({ rewardId }: { rewardId: string }) {
  const router = useRouter();
  const [brand, setBrand] = useState("Amazon");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="flex flex-wrap gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const res = await sendMemberRewardAction(rewardId, { brand, code });
        setBusy(false);
        if (!res.ok) toast.error(res.error); else { toast.success(res.message ?? "Sent"); router.refresh(); }
      }}
    >
      <Select className="h-9 w-28" value={brand} onChange={(e) => setBrand(e.target.value)} aria-label="Voucher brand">
        <option>Amazon</option>
        <option>Flipkart</option>
      </Select>
      <Input className="h-9 max-w-56 font-mono" placeholder="Voucher code you bought" value={code} onChange={(e) => setCode(e.target.value)} aria-label="Voucher code" />
      <Button type="submit" size="sm" className="h-9" loading={busy}>Send code</Button>
      <Button
        type="button" size="sm" variant="outline" className="h-9"
        onClick={async () => {
          if (!window.confirm("Cancel this reward? The customer will not get a voucher for it.")) return;
          const res = await cancelMemberRewardAction(rewardId);
          if (!res.ok) toast.error(res.error); else { toast.success(res.message ?? "Cancelled"); router.refresh(); }
        }}
      >
        Cancel
      </Button>
    </form>
  );
}

export function CancelMembershipButton({ membershipId }: { membershipId: string }) {
  const router = useRouter();
  return (
    <Button
      size="sm" variant="outline"
      onClick={async () => {
        const note = window.prompt("Cancel this membership now? Member prices stop immediately. Refund the fee in Razorpay separately if needed.\n\nReason (optional):");
        if (note === null) return;
        const res = await cancelMembershipAction(membershipId, note);
        if (!res.ok) toast.error(res.error); else { toast.success(res.message ?? "Cancelled"); router.refresh(); }
      }}
    >
      Cancel
    </Button>
  );
}

export function SyncRewardsButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="sm" variant="outline" loading={busy}
      onClick={async () => {
        setBusy(true);
        const res = await syncMemberRewardsAction();
        setBusy(false);
        if (!res.ok) toast.error(res.error);
        else { toast.success(res.data.created > 0 ? `${res.data.created} new reward(s) found` : "Everything is up to date"); router.refresh(); }
      }}
    >
      Check for new rewards
    </Button>
  );
}

export function ApplyPricingButton({ changes, regularProfit }: { changes: number; regularProfit: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="accent" loading={busy} disabled={changes === 0}
      onClick={async () => {
        if (!window.confirm(`Change the regular price of ${changes} product(s) to cost + ${regularProfit}? Customers will see the new prices immediately.`)) return;
        setBusy(true);
        const res = await applyMemberPricingAction();
        setBusy(false);
        if (!res.ok) toast.error(res.error);
        else { toast.success(`${res.data.changed} price(s) updated`); router.refresh(); }
      }}
    >
      Apply to {changes} product{changes === 1 ? "" : "s"}
    </Button>
  );
}
