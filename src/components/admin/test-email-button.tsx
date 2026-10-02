"use client";

import { useState } from "react";
import { toast } from "sonner";
import { sendTestEmailAction } from "@/actions/admin/settings";
import { Button } from "@/components/ui/button";

/** Sends a test email to the admin's own address so mail settings can be checked without a real order. */
export function TestEmailButton() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <div className="space-y-1.5 pt-1">
      <Button
        type="button" size="sm" variant="outline" loading={busy}
        onClick={async () => {
          setBusy(true);
          const res = await sendTestEmailAction();
          setBusy(false);
          if (res.ok) { setResult({ ok: true, text: `Sent to ${res.data.to} — check the inbox and the spam folder.` }); toast.success("Test email sent"); }
          else { setResult({ ok: false, text: res.error }); toast.error("Test email failed"); }
        }}
      >
        Send test email to me
      </Button>
      {result && <p className={result.ok ? "text-xs text-emerald-700" : "break-words text-xs text-red-600"}>{result.text}</p>}
    </div>
  );
}
