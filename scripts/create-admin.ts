/**
 * Creates (or resets the password of) the store owner's ADMIN login — nothing else.
 * Safe for production: it adds no demo data.
 *
 *   ADMIN_EMAIL=you@example.com ADMIN_NAME="Your Name" ADMIN_PASSWORD='…' npm run db:create-admin
 *
 * If ADMIN_PASSWORD is omitted, a strong random password is generated and printed once.
 * Re-running with the same email resets that account's password and signs out its existing sessions.
 */
import { randomBytes } from "crypto";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

async function main() {
  const email = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  const name = (process.env.ADMIN_NAME ?? "Store Owner").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Set ADMIN_EMAIL to a valid email address.");
  const generated = !process.env.ADMIN_PASSWORD;
  const password = process.env.ADMIN_PASSWORD ?? `Bot-${randomBytes(9).toString("base64url")}`;
  if (password.length < 8) throw new Error("ADMIN_PASSWORD must be at least 8 characters.");

  const passwordHash = await bcrypt.hash(password, 12);
  const existing = await db.user.findUnique({ where: { email } });
  const user = await db.user.upsert({
    where: { email },
    update: { role: "ADMIN", passwordHash, status: "ACTIVE" },
    create: { email, name, role: "ADMIN", passwordHash },
  });
  if (existing) await db.session.deleteMany({ where: { userId: user.id } });
  await db.auditLog.create({
    data: { actorId: null, actorEmail: "cli", action: existing ? "admin.password_reset_cli" : "admin.created_cli", entityType: "User", entityId: user.id, newValue: { email, role: "ADMIN" } },
  });
  await db.storeSettings.upsert({ where: { id: "store" }, update: {}, create: { id: "store" } });

  console.log(`${existing ? "Updated" : "Created"} admin: ${email}`);
  if (generated) console.log(`Password (shown once — change it after signing in): ${password}`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
