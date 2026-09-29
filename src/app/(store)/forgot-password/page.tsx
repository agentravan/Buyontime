import type { Metadata } from "next";
import Link from "next/link";
import { getSettings } from "@/lib/settings";
import { ForgotForm } from "@/components/auth-forms";
import { AuthShell } from "@/components/motion/auth-shell";

export const metadata: Metadata = { title: "Forgot password", robots: { index: false } };

export default async function ForgotPasswordPage() {
  const look = (await getSettings()).loginLook === "gold" ? "gold" : "teal";
  return (
    <AuthShell look={look} title="Forgot" accent="password?" subtitle="Enter your email and we'll send you a link to reset it." footer={<Link href="/login" className="auth-link hover:underline">Back to sign in</Link>}>
      <ForgotForm />
    </AuthShell>
  );
}
