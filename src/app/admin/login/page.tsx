import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isStaff } from "@/lib/permissions";
import { strParam } from "@/lib/utils";
import { LoginForm } from "@/components/auth-forms";
import { AuthShell } from "@/components/motion/auth-shell";

export const metadata: Metadata = { title: "Admin sign in", robots: { index: false } };

export default async function AdminLoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (user && isStaff(user.role)) redirect("/admin/dashboard");
  const next = strParam(sp.next);
  return (
    <div className="[&>div]:min-h-dvh">
      <AuthShell look="gold" title="Welcome" accent="back" subtitle="Sign in to manage orders, products and payments." badge="Admin portal" trust={false}>
        {(strParam(sp.denied) || (user && !isStaff(user.role))) && (
          <p className="mb-4 rounded-lg bg-amber-400/15 px-3 py-2 text-sm text-amber-100">This area is for store staff only. Please sign in with a staff account.</p>
        )}
        <LoginForm portal="admin" next={next && next.startsWith("/admin") ? next : undefined} />
      </AuthShell>
    </div>
  );
}
