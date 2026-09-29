import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { resolveLook } from "@/lib/auth-look";
import { getSettings } from "@/lib/settings";
import { strParam } from "@/lib/utils";
import { AuthSwitch, RegisterForm } from "@/components/auth-forms";
import { AuthShell } from "@/components/motion/auth-shell";

export const metadata: Metadata = { title: "Create account", robots: { index: false } };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  if (await getCurrentUser()) redirect("/account");
  const next = strParam(sp.next);
  const look = resolveLook(strParam(sp.look), (await getSettings()).loginLook);
  return (
    <AuthShell look={look} title="Create" accent="account" subtitle="Takes under a minute. Pay online or Cash on Delivery." footer={<AuthSwitch to="login" next={next} />}>
      <RegisterForm next={next} />
    </AuthShell>
  );
}
