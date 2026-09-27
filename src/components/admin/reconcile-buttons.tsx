"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { checkReconciliationAction, resolveReconciliationAction } from "@/actions/admin/operations";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";

export function ReconcileButtons({ paymentId, mismatch }: { paymentId: string; mismatch: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="mt-1 flex flex-wrap gap-1.5">
      <Button
        size="sm"
        variant="outline"
        loading={pending}
        onClick={() => start(async () => {
          const res = await checkReconciliationAction(paymentId);
          if (!res.ok) toast.error(res.error);
          else if (res.data.match) toast.success("Matches Razorpay");
          else toast.warning(`Mismatch: ${res.data.note}`);
          router.refresh();
        })}
      >
        {!pending && <RefreshCw />} Check
      </Button>
      {mismatch && (
        <ConfirmDialog
          trigger={<Button size="sm">Apply Razorpay status</Button>}
          title="Apply Razorpay's verified status?"
          description="The payment is re-fetched from Razorpay and applied through the normal payment workflow (inventory, order status and notifications update accordingly). The before/after values are recorded in the audit log."
          confirmLabel="Apply"
          onConfirm={async () => {
            const res = await resolveReconciliationAction(paymentId);
            if (!res.ok) toast.error(res.error);
            else toast[res.data.resolved ? "success" : "warning"](res.data.resolved ? "Reconciled" : "Still differs — review manually");
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
