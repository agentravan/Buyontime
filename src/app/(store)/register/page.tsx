import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { strParam } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { RegisterForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "Create account", robots: { index: false } };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  if (await getCurrentUser()) redirect("/account");
  return (
    <div className="container-page grid max-w-md py-10">
      <Card className="p-6 sm:p-8">
        <h1 className="text-2xl font-extrabold tracking-tight">Create your account</h1>
        <p className="mb-6 mt-1 text-sm text-muted">It takes less than a minute.</p>
        <RegisterForm next={strParam(sp.next)} />
      </Card>
    </div>
  );
}
