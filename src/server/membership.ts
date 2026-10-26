import "server-only";
import { randomInt } from "node:crypto";
import type { MembershipPlan } from "@prisma/client";
import { db, type Tx } from "@/lib/db";
import { audit } from "@/lib/audit";
import type { SessionUser } from "@/lib/auth";
import { razorpayConfig } from "@/lib/env";
import { AppError, ForbiddenError } from "@/lib/errors";
import { formatINR } from "@/lib/money";
import { PLAN_LABEL, PLAN_MONTHS, isMemberActive, memberRule, membershipPeriod, planPrice, rewardAmount, rewardsEarned, type MemberPriceRule } from "@/lib/membership";
import { razorpay, verifyPaymentSignature, type RzpPayment } from "@/lib/razorpay";
import { rateLimit } from "@/lib/rate-limit";
import { getSettings } from "@/lib/settings";

/**
 * BuyOnTime Plus membership.
 *
 * Buying: a PENDING Membership row is created together with a Razorpay order. It becomes ACTIVE only
 * after the payment is confirmed — by the browser callback (signature checked, payment re-fetched from
 * Razorpay) or by the webhook, whichever comes first. Activation locks the row, so it happens exactly once.
 *
 * Rewards: every `memberRewardEveryOrders` delivered orders placed under a membership earn one gift voucher
 * (a MemberReward row, unique per membership + milestone). The admin buys the voucher and records the code.
 */

export type MembershipCheckoutParams = {
  keyId: string;
  razorpayOrderId: string;
  amount: number;
  currency: "INR";
  name: string;
  description: string;
  prefill: { name: string; email: string; contact: string };
};

/** The membership covering this moment, if any (used to price carts and tag orders). */
export async function activeMembership(userId: string, now = new Date()) {
  return db.membership.findFirst({
    where: { userId, status: "ACTIVE", startsAt: { lte: now }, endsAt: { gt: now } },
    orderBy: { endsAt: "desc" },
    select: { id: true, endsAt: true, plan: true },
  });
}

/** Member pricing context for a shopper (guests and staff get regular prices). */
export async function pricingFor(user: Pick<SessionUser, "id" | "role"> | null): Promise<{ rule: MemberPriceRule; isMember: boolean; membershipId: string | null }> {
  const settings = await getSettings();
  const rule = memberRule(settings);
  if (!user || !rule.enabled || user.role !== "CUSTOMER") return { rule, isMember: false, membershipId: null };
  const m = await activeMembership(user.id);
  return { rule, isMember: Boolean(m), membershipId: m?.id ?? null };
}

export async function startMembershipPurchase(user: SessionUser, plan: MembershipPlan): Promise<MembershipCheckoutParams> {
  if (user.role !== "CUSTOMER") throw new AppError("Membership is for customer accounts.");
  await rateLimit(`membership-buy:${user.id}`, 10, 600);
  const cfg = razorpayConfig();
  if (!cfg.configured) throw new AppError("Online payment is not available right now. Please try again later.", "GATEWAY_NOT_CONFIGURED", 503);
  const settings = await getSettings();
  if (!settings.membershipEnabled) throw new AppError("Membership is not available right now.");
  const amount = planPrice(settings, plan);
  if (amount < 100) throw new AppError("This plan is not available right now.");

  const me = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { name: true, email: true, phone: true } });
  const rzpOrder = await razorpay.createOrder({
    amount,
    receipt: `plus-${user.id}`.slice(0, 40),
    notes: { kind: "membership", userId: user.id, plan },
  });
  await db.membership.create({
    data: { userId: user.id, plan, months: PLAN_MONTHS[plan], amount, razorpayOrderId: rzpOrder.id },
  });
  return {
    keyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || cfg.keyId,
    razorpayOrderId: rzpOrder.id,
    amount,
    currency: "INR",
    name: settings.storeName,
    description: `BuyOnTime Plus — ${PLAN_LABEL[plan]}`,
    prefill: { name: me.name, email: me.email, contact: me.phone ?? "" },
  };
}

export type MembershipApplyOutcome =
  | { kind: "not-membership" }
  | { kind: "duplicate" }
  | { kind: "activated"; membershipId: string; endsAt: Date }
  | { kind: "failed" }
  | { kind: "authorized" }
  | { kind: "attention"; reason: string };

async function lockMembership(tx: Tx, razorpayOrderId: string): Promise<string | null> {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Membership" WHERE "razorpayOrderId" = ${razorpayOrderId} FOR UPDATE`;
  return rows[0]?.id ?? null;
}

/** True when a Razorpay order id belongs to a membership purchase (and not to a shop order). */
export async function isMembershipPayment(razorpayOrderId: string | null | undefined): Promise<boolean> {
  if (!razorpayOrderId) return false;
  return (await db.membership.count({ where: { razorpayOrderId } })) > 0;
}

/**
 * Applies a Razorpay payment to its membership. Idempotent: replays and races between the browser
 * callback and the webhook end in exactly one activation.
 */
export async function applyMembershipPayment(p: RzpPayment): Promise<MembershipApplyOutcome> {
  if (!p.order_id) return { kind: "not-membership" };

  if (p.status === "authorized") {
    // Auto-capture is off on this account: capture now, then the captured state is applied below.
    const m = await db.membership.findUnique({ where: { razorpayOrderId: p.order_id } });
    if (!m) return { kind: "not-membership" };
    if (m.status !== "PENDING" || p.amount !== m.amount) return { kind: "attention", reason: "authorized payment for a membership that is not pending" };
    try {
      p = await razorpay.capturePayment(p.id, p.amount);
    } catch (err) {
      console.error("[membership] capture failed", p.id, err);
      return { kind: "authorized" };
    }
  }

  const outcome = await db.$transaction(async (tx): Promise<MembershipApplyOutcome> => {
    const id = await lockMembership(tx, p.order_id!);
    if (!id) return { kind: "not-membership" };
    const m = await tx.membership.findUniqueOrThrow({ where: { id } });

    if (p.status === "failed") {
      if (m.status === "PENDING") await tx.membership.update({ where: { id }, data: { status: "FAILED", note: p.error_description?.slice(0, 300) ?? "Payment failed" } });
      return { kind: "failed" };
    }
    if (p.status !== "captured") return { kind: "attention", reason: `payment status ${p.status}` };

    if (m.status === "ACTIVE" || m.status === "CANCELLED") {
      if (m.razorpayPaymentId === p.id) return { kind: "duplicate" };
      await audit({ action: "membership.duplicate_payment", entityType: "Membership", entityId: id, newValue: { paymentId: p.id, amount: p.amount } }, tx);
      return { kind: "attention", reason: `second payment ${p.id} for membership ${id} — refund it from Razorpay` };
    }
    if (p.amount !== m.amount) {
      await tx.membership.update({ where: { id }, data: { note: `Amount mismatch: paid ${p.amount}, expected ${m.amount}` } });
      return { kind: "attention", reason: "amount mismatch" };
    }

    // FAILED → paid on a retry is fine: a later successful attempt on the same Razorpay order activates it.
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${m.userId} FOR UPDATE`;
    const user = await tx.user.findUniqueOrThrow({ where: { id: m.userId }, select: { memberUntil: true } });
    const now = new Date();
    const { startsAt, endsAt } = membershipPeriod(now, user.memberUntil, m.months);
    await tx.membership.update({
      where: { id },
      data: { status: "ACTIVE", razorpayPaymentId: p.id, paidAt: now, startsAt, endsAt, note: null },
    });
    await tx.user.update({ where: { id: m.userId }, data: { memberUntil: endsAt } });
    await tx.notification.create({
      data: {
        audience: "CUSTOMER", userId: m.userId, event: "MEMBERSHIP_ACTIVE",
        title: "Welcome to BuyOnTime Plus",
        body: `Your ${PLAN_LABEL[m.plan]} membership is active until ${endsAt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })}. Member prices now apply at checkout.`,
        link: "/membership", dedupeKey: `membership-active:${id}`,
      },
    });
    await audit({ action: "membership.activated", entityType: "Membership", entityId: id, newValue: { userId: m.userId, plan: m.plan, amount: m.amount, startsAt, endsAt, paymentId: p.id } }, tx);
    return { kind: "activated", membershipId: id, endsAt };
  });

  if (outcome.kind === "attention") console.warn("[membership]", outcome.reason);
  return outcome;
}

/** Browser callback after Razorpay Checkout: verify the signature, then confirm with Razorpay itself. */
export async function verifyMembershipPurchase(
  user: SessionUser,
  input: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string },
): Promise<{ active: boolean; endsAt: string | null }> {
  await rateLimit(`membership-verify:${user.id}`, 20, 60);
  const m = await db.membership.findUnique({ where: { razorpayOrderId: input.razorpay_order_id } });
  if (!m || m.userId !== user.id) throw new ForbiddenError("Payment not found.");
  if (!verifyPaymentSignature(input.razorpay_order_id, input.razorpay_payment_id, input.razorpay_signature)) {
    throw new AppError("We could not verify this payment. If money was deducted, it will be confirmed automatically or refunded.", "VERIFICATION_FAILED", 400);
  }
  let p: RzpPayment | null = null;
  try {
    p = await razorpay.fetchPayment(input.razorpay_payment_id);
  } catch (err) {
    console.error("[membership] fetch payment failed; webhook will confirm", err);
  }
  if (p && p.order_id !== input.razorpay_order_id) throw new AppError("Payment does not belong to this membership.", "VERIFICATION_FAILED", 400);
  if (p) await applyMembershipPayment(p);
  const fresh = await db.membership.findUniqueOrThrow({ where: { id: m.id } });
  return { active: fresh.status === "ACTIVE", endsAt: fresh.endsAt?.toISOString() ?? null };
}

/**
 * Creates the vouchers a customer has earned and not yet been given. Safe to call any time and
 * from anywhere: the unique (membership, milestone) key makes repeats a no-op.
 */
export async function syncMemberRewards(userId: string): Promise<number> {
  const settings = await getSettings();
  const every = settings.memberRewardEveryOrders;
  if (every <= 0) return 0;
  const memberships = await db.membership.findMany({
    where: { userId, status: "ACTIVE" },
    select: { id: true, rewards: { select: { milestone: true } }, _count: { select: { orders: { where: { status: "DELIVERED" } } } } },
  });
  let created = 0;
  for (const m of memberships) {
    const have = new Set(m.rewards.map((r) => r.milestone));
    const earned = rewardsEarned(m._count.orders, every);
    for (let k = 1; k <= earned; k++) {
      const milestone = k * every;
      if (have.has(milestone)) continue;
      const amount = rewardAmount(settings.memberRewardMin, settings.memberRewardMax, randomInt);
      const res = await db.memberReward.createMany({ data: [{ userId, membershipId: m.id, milestone, amount }], skipDuplicates: true });
      if (res.count === 1) {
        created++;
        await db.notification.create({
          data: {
            audience: "CUSTOMER", userId, event: "MEMBER_REWARD",
            title: `You earned a ${formatINR(amount)} gift voucher`,
            body: `Thanks for ${milestone} delivered orders as a Plus member. We will send your Amazon / Flipkart voucher code here shortly.`,
            link: "/membership", dedupeKey: `member-reward:${m.id}:${milestone}`,
          },
        }).catch(() => undefined);
      }
    }
  }
  return created;
}

export type MembershipView = {
  enabled: boolean;
  isMember: boolean;
  memberUntil: string | null;
  plans: { plan: MembershipPlan; label: string; price: number }[];
  memberProfitGap: number;
  rewardEvery: number;
  rewardMin: number;
  rewardMax: number;
  deliveredThisMembership: number;
  rewards: { id: string; amount: number; milestone: number; status: string; brand: string | null; code: string | null; sentAt: string | null }[];
  history: { id: string; plan: MembershipPlan; amount: number; status: string; startsAt: string | null; endsAt: string | null; createdAt: string }[];
};

export async function getMembershipView(userId: string | null): Promise<MembershipView> {
  const settings = await getSettings();
  const base = {
    enabled: settings.membershipEnabled,
    plans: (["HALF_YEAR", "YEAR"] as const).map((plan) => ({ plan, label: PLAN_LABEL[plan], price: planPrice(settings, plan) })),
    memberProfitGap: Math.max(0, settings.regularProfit - settings.memberProfit),
    rewardEvery: settings.memberRewardEveryOrders,
    rewardMin: settings.memberRewardMin,
    rewardMax: settings.memberRewardMax,
  };
  if (!userId) return { ...base, isMember: false, memberUntil: null, deliveredThisMembership: 0, rewards: [], history: [] };

  await syncMemberRewards(userId);
  const [user, current, rewards, history] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { memberUntil: true } }),
    activeMembership(userId),
    db.memberReward.findMany({ where: { userId, status: { not: "CANCELLED" } }, orderBy: { createdAt: "desc" } }),
    db.membership.findMany({ where: { userId, status: { in: ["ACTIVE", "CANCELLED"] } }, orderBy: { createdAt: "desc" }, take: 10 }),
  ]);
  const delivered = current ? await db.order.count({ where: { membershipId: current.id, status: "DELIVERED" } }) : 0;
  return {
    ...base,
    isMember: isMemberActive(user?.memberUntil),
    memberUntil: user?.memberUntil?.toISOString() ?? null,
    deliveredThisMembership: delivered,
    rewards: rewards.map((r) => ({
      id: r.id, amount: r.amount, milestone: r.milestone, status: r.status, brand: r.brand,
      code: r.status === "SENT" ? r.code : null, sentAt: r.sentAt?.toISOString() ?? null,
    })),
    history: history.map((h) => ({
      id: h.id, plan: h.plan, amount: h.amount, status: h.status, startsAt: h.startsAt?.toISOString() ?? null,
      endsAt: h.endsAt?.toISOString() ?? null, createdAt: h.createdAt.toISOString(),
    })),
  };
}

// ─────────────── Admin ───────────────

export async function sendMemberReward(rewardId: string, actor: { id: string; email: string }, input: { brand: "Amazon" | "Flipkart"; code: string }) {
  const code = input.code.trim();
  if (code.length < 4 || code.length > 120) throw new AppError("Enter the voucher code.");
  await db.$transaction(async (tx) => {
    const r = await tx.memberReward.findUnique({ where: { id: rewardId } });
    if (!r) throw new AppError("Reward not found.");
    if (r.status === "CANCELLED") throw new AppError("This reward was cancelled.");
    const now = new Date();
    await tx.memberReward.update({ where: { id: rewardId }, data: { status: "SENT", brand: input.brand, code, sentAt: r.sentAt ?? now } });
    await tx.notification.create({
      data: {
        audience: "CUSTOMER", userId: r.userId, event: "MEMBER_REWARD_SENT",
        title: `Your ${formatINR(r.amount)} ${input.brand} voucher is here`,
        body: "Open BuyOnTime Plus in your account to see the code.",
        link: "/membership", dedupeKey: `member-reward-sent:${r.id}:${now.getTime()}`,
      },
    });
    await audit({ actor, action: "membership.reward_sent", entityType: "MemberReward", entityId: r.id, oldValue: { status: r.status, brand: r.brand }, newValue: { status: "SENT", brand: input.brand, amount: r.amount } }, tx);
  });
}

export async function cancelMemberReward(rewardId: string, actor: { id: string; email: string }) {
  const r = await db.memberReward.findUnique({ where: { id: rewardId } });
  if (!r) throw new AppError("Reward not found.");
  if (r.status === "SENT") throw new AppError("This voucher was already sent.");
  await db.memberReward.update({ where: { id: rewardId }, data: { status: "CANCELLED" } });
  await audit({ actor, action: "membership.reward_cancelled", entityType: "MemberReward", entityId: r.id, oldValue: { status: r.status }, newValue: { status: "CANCELLED" } });
}

/** Ends a membership now (e.g. after refunding it in Razorpay). Member prices stop on the next cart load. */
export async function cancelMembership(membershipId: string, actor: { id: string; email: string }, note?: string | null) {
  await db.$transaction(async (tx) => {
    const m = await tx.membership.findUnique({ where: { id: membershipId } });
    if (!m) throw new AppError("Membership not found.");
    if (m.status !== "ACTIVE") throw new AppError("Only an active membership can be cancelled.");
    const now = new Date();
    await tx.membership.update({ where: { id: m.id }, data: { status: "CANCELLED", cancelledAt: now, note: note?.slice(0, 300) || "Cancelled by store" } });
    // The customer stays a member only through their other (stacked) active memberships.
    const rest = await tx.membership.findFirst({ where: { userId: m.userId, status: "ACTIVE", id: { not: m.id } }, orderBy: { endsAt: "desc" }, select: { endsAt: true } });
    await tx.user.update({ where: { id: m.userId }, data: { memberUntil: rest?.endsAt && rest.endsAt > now ? rest.endsAt : now } });
    await audit({ actor, action: "membership.cancelled", entityType: "Membership", entityId: m.id, oldValue: { status: m.status, endsAt: m.endsAt }, newValue: { status: "CANCELLED", note } }, tx);
  });
}

export type AdminMembershipData = Awaited<ReturnType<typeof adminMembershipData>>;

export async function adminMembershipData() {
  const now = new Date();
  const [activeCount, revenue, pending, recentMembers, sent] = await Promise.all([
    db.user.count({ where: { memberUntil: { gt: now } } }),
    db.membership.aggregate({ where: { status: { in: ["ACTIVE", "CANCELLED"] } }, _sum: { amount: true }, _count: true }),
    db.memberReward.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" }, take: 100, include: { user: { select: { id: true, name: true, email: true, phone: true } } } }),
    db.membership.findMany({ where: { status: { in: ["ACTIVE", "CANCELLED"] } }, orderBy: { paidAt: "desc" }, take: 50, include: { user: { select: { id: true, name: true, email: true } }, _count: { select: { orders: true } } } }),
    db.memberReward.aggregate({ where: { status: "SENT" }, _sum: { amount: true }, _count: true }),
  ]);
  return {
    activeCount,
    paidCount: revenue._count,
    revenue: revenue._sum.amount ?? 0,
    vouchersSent: sent._count,
    vouchersSentValue: sent._sum.amount ?? 0,
    pending,
    recentMembers,
  };
}

/** Sync rewards for every customer with delivered member orders (used by the admin page). */
export async function syncAllMemberRewards(): Promise<number> {
  const rows = await db.membership.findMany({
    where: { status: "ACTIVE", orders: { some: { status: "DELIVERED" } } },
    select: { userId: true },
    distinct: ["userId"],
    take: 500,
  });
  let created = 0;
  for (const r of rows) created += await syncMemberRewards(r.userId);
  return created;
}
