import "server-only";
import type { Prisma } from "@prisma/client";
import { db, type Tx } from "@/lib/db";

export type AuditInput = {
  actor?: { id: string; email: string } | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
};

function json(v: unknown): Prisma.InputJsonValue | undefined {
  if (v === undefined) return undefined;
  return JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
}

/** Append-only audit trail for financial and operational accountability. */
export async function audit(input: AuditInput, tx: Tx = db) {
  await tx.auditLog.create({
    data: {
      actorId: input.actor?.id ?? null,
      actorEmail: input.actor?.email ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      oldValue: json(input.oldValue),
      newValue: json(input.newValue),
    },
  });
}

/** Returns only the keys whose values changed, for compact old/new audit entries. */
export function diff<T extends Record<string, unknown>>(before: T, after: Partial<T>) {
  const oldValue: Record<string, unknown> = {};
  const newValue: Record<string, unknown> = {};
  for (const k of Object.keys(after)) {
    const a = before[k];
    const b = after[k];
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      oldValue[k] = a;
      newValue[k] = b;
    }
  }
  return { oldValue, newValue, changed: Object.keys(newValue).length > 0 };
}
