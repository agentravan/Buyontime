import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { AccountNav } from "@/components/store/account-nav";

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/account");
  const unread = await db.notification.count({ where: { audience: "CUSTOMER", userId: user.id, readAt: null } });
  return (
    <div className="container-page py-6">
      <div className="grid gap-6 lg:grid-cols-[230px_1fr]">
        <aside>
          <div className="mb-3 hidden rounded-2xl bg-white p-4 ring-1 ring-line lg:block">
            <p className="text-xs text-muted">Hello,</p>
            <p className="truncate font-bold">{user.name}</p>
          </div>
          <AccountNav unread={unread} />
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
