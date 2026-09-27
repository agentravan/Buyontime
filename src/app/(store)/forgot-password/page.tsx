import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { ForgotForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "Forgot password", robots: { index: false } };

export default function ForgotPasswordPage() {
  return (
    <div className="container-page grid max-w-md py-10">
      <Card className="p-6 sm:p-8">
        <h1 className="text-2xl font-extrabold tracking-tight">Forgot your password?</h1>
        <p className="mb-6 mt-1 text-sm text-muted">Enter your email and we&apos;ll send you a link to reset it.</p>
        <ForgotForm />
        <p className="mt-4 text-center text-sm"><Link href="/login" className="font-semibold text-brand-700 hover:underline">Back to sign in</Link></p>
      </Card>
    </div>
  );
}
