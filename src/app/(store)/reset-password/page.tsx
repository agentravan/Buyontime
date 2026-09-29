import type { Metadata } from "next";
import Link from "next/link";
import { getSettings } from "@/lib/settings";
import { strParam } from "@/lib/utils";
import { ResetForm } from "@/components/auth-forms";
import { AuthShell } from "@/components/motion/auth-shell";

export const metadata: Metadata = { title: "Reset password", robots: { index: false } };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const token = strParam((await searchParams).token);
  const look = (await getSettings()).loginLook === "gold" ? "gold" : "teal";
  return (
    <AuthShell look={look} title="Set a new" accent="password" subtitle="Choose a password you don't use on other sites.">
      {token ? (
        <ResetForm token={token} />
      ) : (
        <p className="text-sm text-white/75">This link is incomplete. <Link href="/forgot-password" className="auth-link hover:underline">Request a new one</Link>.</p>
      )}
    </AuthShell>
  );
}
