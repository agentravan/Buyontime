import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { strParam } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { LoginForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const next = strParam(sp.next);
  if (await getCurrentUser()) redirect(next && next.startsWith("/") ? next : "/account");
  return (
    <div className="container-page grid max-w-md py-10">
      <Card className="p-6 sm:p-8">
        <h1 className="text-2xl font-extrabold tracking-tight">Welcome back</h1>
        <p className="mb-6 mt-1 text-sm text-muted">Sign in to track orders, save addresses and check out faster.</p>
        <LoginForm next={next} />
      </Card>
    </div>
  );
}
