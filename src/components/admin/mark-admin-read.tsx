"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck } from "lucide-react";
import { markAdminNotificationsReadAction } from "@/actions/admin/operations";
import { Button } from "@/components/ui/button";

export function MarkAdminRead() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button variant="outline" loading={pending} onClick={() => start(async () => { await markAdminNotificationsReadAction(); router.refresh(); })}>
      <CheckCheck /> Mark all read
    </Button>
  );
}
