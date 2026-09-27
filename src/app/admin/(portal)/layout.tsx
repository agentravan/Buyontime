import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { can, isStaff, PERMISSIONS } from "@/lib/permissions";
import { AdminShell } from "@/components/admin/shell";

export const dynamic = "force-dynamic";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/login");
  if (!isStaff(user.role)) redirect("/admin/login?denied=1");
  const perms = PERMISSIONS.filter((p) => can(user.role, p));
  const unread = await db.notification.count({ where: { audience: "ADMIN", readAt: null } });
  return (
    <AdminShell user={{ name: user.name, email: user.email, role: user.role }} permissions={perms} unread={unread}>
      {children}
    </AdminShell>
  );
}
