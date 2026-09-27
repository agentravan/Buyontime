import type { Role } from "@prisma/client";

/**
 * Role → permission map. Permissions are checked server-side on every admin page, action and API route.
 * To make permissions configurable later, move this map into the database; call sites use `can()` only.
 */
export const PERMISSIONS = [
  "dashboard:view",
  "finance:view",
  "products:manage",
  "inventory:manage",
  "categories:manage",
  "orders:view",
  "orders:update",
  "payments:view",
  "payments:reconcile",
  "refunds:manage",
  "returns:manage",
  "customers:view",
  "customers:manage",
  "coupons:manage",
  "settings:manage",
  "audit:view",
  "notifications:view",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  ADMIN: PERMISSIONS,
  SUPPLIER: [
    "dashboard:view",
    "products:manage",
    "inventory:manage",
    "orders:view",
    "orders:update",
    "notifications:view",
  ],
  CUSTOMER: [],
};

export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function isStaff(role: Role): boolean {
  return role === "ADMIN" || role === "SUPPLIER";
}
