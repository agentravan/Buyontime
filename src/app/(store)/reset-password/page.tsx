import type { Metadata } from "next";
import Link from "next/link";
import { strParam } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { ResetForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "Reset password", robots: { index: false } };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const token = strParam((await searchParams).token);
  return (
    <div className="container-page grid max-w-md py-10">
      <Card className="p-6 sm:p-8">
        <h1 className="text-2xl font-extrabold tracking-tight">Set a new password</h1>
        {token ? (
          <div className="mt-6"><ResetForm token={token} /></div>
        ) : (
          <p className="mt-3 text-sm text-muted">This link is incomplete. <Link href="/forgot-password" className="font-semibold text-brand-700">Request a new one</Link>.</p>
        )}
      </Card>
    </div>
  );
}
