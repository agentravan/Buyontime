import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { resolveLook } from "@/lib/auth-look";
import { getSettings } from "@/lib/settings";
import { strParam } from "@/lib/utils";
import { AuthSwitch, LoginForm } from "@/components/auth-forms";
import { AuthShell } from "@/components/motion/auth-shell";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const next = strParam(sp.next);
  if (await getCurrentUser()) redirect(next && next.startsWith("/") ? next : "/account");
  const look = resolveLook(strParam(sp.look), (await getSettings()).loginLook);
  return (
    <AuthShell look={look} title="Welcome" accent="back" subtitle="Log in to see your orders and check out faster." footer={<AuthSwitch to="register" next={next} />}>
      <LoginForm next={next} />
    </AuthShell>
  );
}
