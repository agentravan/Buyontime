"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import {
  clientIp, createSession, destroySession, getCurrentUser, hashPassword, hashToken, randomToken, requireUser,
  revokeOtherSessions, verifyPassword,
} from "@/lib/auth";
import { appUrl } from "@/lib/env";
import { AppError, safeAction, type ActionResult } from "@/lib/errors";
import { notifyAccount } from "@/lib/notifications/dispatch";
import { isStaff } from "@/lib/permissions";
import { rateLimit } from "@/lib/rate-limit";
import { loginSchema, passwordSchema, registerSchema } from "@/lib/validation";
import { mergeGuestCart } from "@/server/cart";

function safeNext(next: unknown, fallback: string): string {
  const n = typeof next === "string" ? next : "";
  return n.startsWith("/") && !n.startsWith("//") ? n : fallback;
}

export async function registerAction(input: { name: string; email: string; phone: string; password: string; next?: string }): Promise<ActionResult<{ redirectTo: string }>> {
  return safeAction(async () => {
    await rateLimit(`register:${await clientIp()}`, Number(process.env.RATE_LIMIT_REGISTER_PER_HOUR ?? 30), 3600);
    const data = registerSchema.parse(input);
    const exists = await db.user.findUnique({ where: { email: data.email } });
    if (exists) throw new AppError("An account with this email already exists. Please sign in.");
    const user = await db.user.create({
      data: { name: data.name, email: data.email, phone: data.phone, passwordHash: await hashPassword(data.password), role: "CUSTOMER" },
    });
    await createSession(user.id);
    await mergeGuestCart(user.id);
    await notifyAccount("WELCOME", user.id);
    return { redirectTo: safeNext(input.next, "/account") };
  });
}

export async function loginAction(input: { email: string; password: string; next?: string; portal?: "store" | "admin" }): Promise<ActionResult<{ redirectTo: string }>> {
  return safeAction(async () => {
    const ip = await clientIp();
    await rateLimit(`login-ip:${ip}`, Number(process.env.RATE_LIMIT_LOGIN_PER_IP ?? 60), 900);
    const data = loginSchema.parse(input);
    await rateLimit(`login:${data.email}`, Number(process.env.RATE_LIMIT_LOGIN_PER_ACCOUNT ?? 8), 900);
    const user = await db.user.findUnique({ where: { email: data.email } });
    // Same message for unknown email and wrong password (no account enumeration).
    const ok = user ? await verifyPassword(data.password, user.passwordHash) : await verifyPassword(data.password, "$2a$12$C6UzMDM.H6dfI/f/IKcEeO5b5Q2y9Ci0Vx5rLx5nJY1rYvQ8b7Q6e");
    if (!user || !ok) throw new AppError("Incorrect email or password.", "INVALID_CREDENTIALS", 401);
    if (user.status !== "ACTIVE") throw new AppError("This account has been blocked. Please contact support.", "BLOCKED", 403);
    if (input.portal === "admin" && !isStaff(user.role)) {
      throw new AppError("This login is for store staff only.", "FORBIDDEN", 403);
    }
    await createSession(user.id);
    if (!isStaff(user.role)) await mergeGuestCart(user.id);
    const fallback = isStaff(user.role) && input.portal === "admin" ? "/admin/dashboard" : "/account";
    return { redirectTo: safeNext(input.next, fallback) };
  });
}

export async function logoutAction() {
  const user = await getCurrentUser();
  await destroySession();
  redirect(user && isStaff(user.role) ? "/admin/login" : "/");
}

export async function forgotPasswordAction(input: { email: string }): Promise<ActionResult<null>> {
  return safeAction(async () => {
    await rateLimit(`forgot:${await clientIp()}`, 5, 900);
    const email = String(input.email ?? "").trim().toLowerCase();
    const user = await db.user.findUnique({ where: { email } });
    if (user && user.status === "ACTIVE") {
      await rateLimit(`forgot-user:${user.id}`, 3, 3600);
      const token = randomToken();
      await db.passwordResetToken.create({ data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 30 * 60000) } });
      const resetUrl = `${appUrl()}/reset-password?token=${encodeURIComponent(token)}`;
      await notifyAccount("PASSWORD_RESET", user.id, { resetUrl, key: token.slice(0, 8) });
      if (process.env.NODE_ENV !== "production" && !process.env.RESEND_API_KEY) {
        console.info(`[dev] password reset link for ${email}: ${resetUrl}`);
      }
    }
    // Always the same response so the form cannot be used to discover accounts.
    return null;
  }, "If an account exists for that email, a reset link has been sent.");
}

export async function resetPasswordAction(input: { token: string; password: string }): Promise<ActionResult<null>> {
  return safeAction(async () => {
    await rateLimit(`reset:${await clientIp()}`, 10, 900);
    const password = passwordSchema.parse(input.password);
    const row = await db.passwordResetToken.findUnique({ where: { tokenHash: hashToken(String(input.token ?? "")) } });
    if (!row || row.usedAt || row.expiresAt < new Date()) throw new AppError("This reset link is invalid or has expired. Please request a new one.");
    await db.$transaction([
      db.user.update({ where: { id: row.userId }, data: { passwordHash: await hashPassword(password) } }),
      db.passwordResetToken.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
      db.session.deleteMany({ where: { userId: row.userId } }),
    ]);
    return null;
  }, "Password updated. Please sign in with your new password.");
}

export async function changePasswordAction(input: { current: string; next: string }): Promise<ActionResult<null>> {
  return safeAction(async () => {
    const user = await requireUser();
    await rateLimit(`change-pw:${user.id}`, 5, 900);
    const full = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    if (!(await verifyPassword(input.current, full.passwordHash))) throw new AppError("Your current password is incorrect.");
    const password = passwordSchema.parse(input.next);
    await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(password) } });
    await revokeOtherSessions(user.id);
    return null;
  }, "Password changed. Other devices have been signed out.");
}
