import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { appUrl } from "@/lib/env";
import { Card } from "@/components/ui/card";
import { ReferPanel } from "@/components/store/refer-panel";
import { getReferralState } from "@/server/referral";

export const metadata: Metadata = { title: "Refer & earn", robots: { index: false } };

export default async function ReferPage() {
  const user = await requireUser();
  if (user.role !== "CUSTOMER") {
    return <Card className="p-5 text-sm text-muted">Refer &amp; earn is for customer accounts. Sign in with a customer account to see it.</Card>;
  }
  const state = await getReferralState(user);
  if (!state.enabled) return <Card className="p-5 text-sm text-muted">Refer &amp; earn is not running right now.</Card>;
  return <ReferPanel state={state} shareBase={`${appUrl()}/register?ref=`} />;
}
