import "server-only";
import { redirect } from "next/navigation";
import { getCurrentUser, type SessionUser } from "@/lib/auth";
import { can, isStaff, type Permission } from "@/lib/permissions";

/** Page-level guard for the admin portal. Redirects instead of throwing so pages render cleanly. */
export async function requireStaffPage(permission: Permission): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/login");
  if (!isStaff(user.role)) redirect("/admin/login?denied=1");
  if (!can(user.role, permission)) redirect("/admin/forbidden");
  return user;
}
