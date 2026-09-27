import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isStaff } from "@/lib/permissions";
import { strParam } from "@/lib/utils";
import { LoginForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "Admin sign in", robots: { index: false } };

export default async function AdminLoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (user && isStaff(user.role)) redirect("/admin/dashboard");
  const next = strParam(sp.next);
  return (
    <div className="grid min-h-dvh place-items-center bg-brand-950 px-4 py-10">
      <div className="w-full max-w-sm rounded-3xl bg-white p-7 shadow-lift">
        <div className="mb-6 flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="" className="size-9" />
          <div>
            <p className="text-lg font-extrabold leading-tight">Buyontime</p>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Admin & supplier portal</p>
          </div>
        </div>
        {(strParam(sp.denied) || (user && !isStaff(user.role))) && (
          <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">This area is for store staff only. Please sign in with a staff account.</p>
        )}
        <LoginForm portal="admin" next={next && next.startsWith("/admin") ? next : undefined} />
      </div>
    </div>
  );
}
