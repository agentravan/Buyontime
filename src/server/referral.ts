import "server-only";
import { randomInt } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { formatINR } from "@/lib/money";
import { getSettings } from "@/lib/settings";
import { FRIENDS_PER_BONUS, bonusesEarned, candidateCodes, codeBase, codeProblem, friendsToNextBonus, giftAmount, normalizeCode, shortName } from "@/lib/referral";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const couponCode = () => `GIFT-${Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("")}`;
const isUnique = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

async function freeCodes(wanted: string, count = 3): Promise<string[]> {
  const candidates = candidateCodes(wanted, Array.from({ length: 12 }, () => randomInt(100)));
  if (candidates.length === 0) return [];
  const taken = new Set((await db.user.findMany({ where: { referralCode: { in: candidates } }, select: { referralCode: true } })).map((u) => u.referralCode));
  return candidates.filter((c) => !taken.has(c)).slice(0, count);
}

/** The customer's code, created from their name the first time it is needed. */
export async function ensureReferralCode(user: SessionUser): Promise<string> {
  const current = await db.user.findUnique({ where: { id: user.id }, select: { referralCode: true } });
  if (current?.referralCode) return current.referralCode;
  for (let attempt = 0; attempt < 5; attempt++) {
    const [code] = await freeCodes(codeBase(user.name), 1);
    if (!code) continue;
    try {
      await db.user.update({ where: { id: user.id }, data: { referralCode: code } });
      return code;
    } catch (e) {
      if (!isUnique(e)) throw e;
    }
  }
  throw new AppError("Could not create your referral code. Please try again.");
}

export type CodeCheck = { ok: true; code: string } | { ok: false; error: string; suggestions: string[] };

/** Lets a customer pick their own code. If it is taken, returns free codes close to it. */
export async function chooseReferralCode(user: SessionUser, raw: string): Promise<CodeCheck> {
  const code = normalizeCode(raw);
  const problem = codeProblem(code);
  if (problem) return { ok: false, error: problem, suggestions: problem.includes("not available") ? await freeCodes(codeBase(user.name)) : [] };
  const holder = await db.user.findUnique({ where: { referralCode: code }, select: { id: true } });
  if (holder && holder.id !== user.id) return { ok: false, error: `${code} is already taken.`, suggestions: await freeCodes(code) };
  try {
    await db.user.update({ where: { id: user.id }, data: { referralCode: code } });
  } catch (e) {
    if (isUnique(e)) return { ok: false, error: `${code} is already taken.`, suggestions: await freeCodes(code) };
    throw e;
  }
  return { ok: true, code };
}

/** Who a sign-up should be credited to. Returns null for an unknown code; throws nothing. */
export async function referrerForCode(raw: string | null | undefined, newCustomer: { phone: string; email: string }): Promise<string | null> {
  const code = normalizeCode(raw ?? "");
  if (!code) return null;
  const referrer = await db.user.findUnique({ where: { referralCode: code }, select: { id: true, role: true, status: true, phone: true, email: true } });
  if (!referrer || referrer.role !== "CUSTOMER" || referrer.status !== "ACTIVE") return null;
  // A second account of the same person does not count as a friend.
  if (referrer.phone && referrer.phone === newCustomer.phone) return null;
  if (referrer.email === newCustomer.email) return null;
  return referrer.id;
}

export type Friend = { id: string; name: string; joinedAt: string; stage: "joined" | "ordered" | "delivered"; rewarded: boolean };
export type Gift = { id: string; kind: "friend" | "bonus"; label: string; amount: number; code: string | null; used: boolean; expired: boolean; createdAt: string };
export type PendingGift = { kind: "friend"; friendId: string; label: string } | { kind: "bonus"; milestone: number; label: string };

export type ReferralState = {
  enabled: boolean;
  code: string;
  friends: Friend[];
  /** Real numbers only — nothing projected. */
  totals: { joined: number; ordered: number; delivered: number; giftsValue: number; giftsCount: number };
  toNextBonus: number;
  pending: PendingGift[];
  gifts: Gift[];
  terms: { min: number; max: number; bonus: number; minOrder: number; validDays: number; every: number };
};

export async function getReferralState(user: SessionUser): Promise<ReferralState> {
  const settings = await getSettings();
  const code = await ensureReferralCode(user);
  const [friends, rewards] = await Promise.all([
    db.user.findMany({
      where: { referredById: user.id },
      orderBy: { createdAt: "desc" },
      take: 500,
      select: { id: true, name: true, createdAt: true, orders: { where: { status: { notIn: ["PENDING_PAYMENT", "CANCELLED"] } }, select: { status: true } } },
    }),
    db.referralReward.findMany({ where: { referrerId: user.id }, orderBy: { createdAt: "desc" }, include: { coupon: { select: { code: true, usedCount: true, expiresAt: true } } } }),
  ]);
  const rewardedFriends = new Set(rewards.filter((r) => r.friendId).map((r) => r.friendId));
  const claimedBonuses = new Set(rewards.filter((r) => r.milestone !== null).map((r) => r.milestone));

  const list: Friend[] = friends.map((f) => ({
    id: f.id,
    name: shortName(f.name),
    joinedAt: f.createdAt.toISOString(),
    stage: f.orders.some((o) => o.status === "DELIVERED") ? "delivered" : f.orders.some((o) => !["RTO", "RETURNED"].includes(o.status)) ? "ordered" : "joined",
    rewarded: rewardedFriends.has(f.id),
  }));
  const delivered = list.filter((f) => f.stage === "delivered").length;

  const pending: PendingGift[] = [
    ...list.filter((f) => f.stage === "delivered" && !f.rewarded).map((f): PendingGift => ({ kind: "friend", friendId: f.id, label: `${f.name}'s order was delivered` })),
    ...Array.from({ length: bonusesEarned(delivered) }, (_, i) => i + 1).filter((m) => !claimedBonuses.has(m)).map((m): PendingGift => ({ kind: "bonus", milestone: m, label: `Bonus for ${m * FRIENDS_PER_BONUS} friends` })),
  ];
  const now = new Date();
  const gifts: Gift[] = rewards.map((r) => ({
    id: r.id, kind: r.milestone !== null ? "bonus" : "friend",
    label: r.milestone !== null ? `Bonus for ${r.milestone * FRIENDS_PER_BONUS} friends` : "Gift for a friend's order",
    amount: r.amount, code: r.coupon?.code ?? null, used: (r.coupon?.usedCount ?? 0) > 0,
    expired: Boolean(r.coupon?.expiresAt && r.coupon.expiresAt < now), createdAt: r.createdAt.toISOString(),
  }));

  return {
    enabled: settings.referralEnabled,
    code,
    friends: list,
    totals: { joined: list.length, ordered: list.filter((f) => f.stage !== "joined").length, delivered, giftsValue: gifts.reduce((s, g) => s + g.amount, 0), giftsCount: gifts.length },
    toNextBonus: friendsToNextBonus(delivered),
    pending,
    gifts,
    terms: { min: settings.referralRewardMin, max: settings.referralRewardMax, bonus: settings.referralMilestoneBonus, minOrder: settings.referralCouponMinOrder, validDays: settings.referralCouponValidDays, every: FRIENDS_PER_BONUS },
  };
}

/** Opens one surprise gift: checks it is really earned, then creates the coupon. Safe against double clicks. */
export async function claimGift(user: SessionUser, what: { friendId?: string; milestone?: number }): Promise<Gift> {
  if (user.role !== "CUSTOMER") throw new AppError("Refer & earn is for customer accounts.");
  const settings = await getSettings();
  if (!settings.referralEnabled) throw new AppError("Refer & earn is not running right now.");

  let amount: number;
  let key: { friendId: string; milestone: null } | { friendId: null; milestone: number };
  let label: string;
  if (what.friendId) {
    const friend = await db.user.findFirst({
      where: { id: String(what.friendId), referredById: user.id, orders: { some: { status: "DELIVERED" } } },
      select: { id: true },
    });
    if (!friend) throw new AppError("This gift is not ready yet — it unlocks when your friend's order is delivered.");
    amount = giftAmount(settings.referralRewardMin, settings.referralRewardMax, randomInt(1000));
    key = { friendId: friend.id, milestone: null };
    label = "Gift for a friend's order";
  } else {
    const m = Math.floor(Number(what.milestone));
    const delivered = await db.user.count({ where: { referredById: user.id, orders: { some: { status: "DELIVERED" } } } });
    if (!Number.isFinite(m) || m < 1 || m > bonusesEarned(delivered)) throw new AppError("This bonus is not ready yet.");
    amount = Math.max(500, settings.referralMilestoneBonus);
    key = { friendId: null, milestone: m };
    label = `Bonus for ${m * FRIENDS_PER_BONUS} friends`;
  }

  const expiresAt = new Date(Date.now() + settings.referralCouponValidDays * 86400000);
  const description = `Refer & earn gift: ${formatINR(amount)} off${settings.referralCouponMinOrder > 0 ? ` on orders above ${formatINR(settings.referralCouponMinOrder)}` : ""}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const reward = await db.$transaction(async (tx) => {
        const coupon = await tx.coupon.create({
          data: { code: couponCode(), userId: user.id, source: "referral", type: "FIXED", value: amount, minOrder: settings.referralCouponMinOrder, usageLimit: 1, perUserLimit: 1, isActive: true, expiresAt, description },
        });
        return tx.referralReward.create({ data: { referrerId: user.id, ...key, amount, couponId: coupon.id }, include: { coupon: { select: { code: true } } } });
      });
      return { id: reward.id, kind: key.milestone !== null ? "bonus" : "friend", label, amount, code: reward.coupon?.code ?? null, used: false, expired: false, createdAt: reward.createdAt.toISOString() };
    } catch (e) {
      if (!isUnique(e)) throw e;
      // Either this gift was already opened (another tab / double click) or the coupon code collided.
      const existing = await db.referralReward.findFirst({ where: { referrerId: user.id, ...key }, include: { coupon: { select: { code: true, usedCount: true } } } });
      if (existing) return { id: existing.id, kind: key.milestone !== null ? "bonus" : "friend", label, amount: existing.amount, code: existing.coupon?.code ?? null, used: (existing.coupon?.usedCount ?? 0) > 0, expired: false, createdAt: existing.createdAt.toISOString() };
    }
  }
  throw new AppError("Could not open your gift. Please try again.");
}
