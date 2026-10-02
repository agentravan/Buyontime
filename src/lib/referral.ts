/**
 * Refer & earn — pure rules (no database).
 *
 * Single level only: a customer is rewarded for friends they referred directly, when a friend's order is
 * delivered. There are no rewards for friends-of-friends and the page never shows projected earnings —
 * only what has actually happened.
 */

export const FRIENDS_PER_BONUS = 3;

const RESERVED = new Set(["ADMIN", "BUYONTIME", "SUPPORT", "STORE", "SPIN", "GIFT", "NULL", "TEST", "COUPON", "OFFER", "FREE"]);

/** Upper-cases and strips everything except letters and digits. */
export function normalizeCode(raw: string): string {
  return (raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Why a code cannot be used, or null when its format is fine. */
export function codeProblem(code: string): string | null {
  if (code.length < 4) return "Use at least 4 letters or numbers.";
  if (code.length > 12) return "Use at most 12 letters or numbers.";
  if (!/[A-Z]/.test(code)) return "Include at least one letter.";
  if (RESERVED.has(code) || code.startsWith("SPIN") || code.startsWith("GIFT")) return "This code is not available.";
  return null;
}

/** A starting point for someone's code, from their name: "Priya Sharma" → "PRIYA". */
export function codeBase(name: string): string {
  const first = normalizeCode((name ?? "").trim().split(/\s+/)[0] ?? "").replace(/[0-9]/g, "");
  return (first.length >= 3 ? first : `${first}FRIEND`).slice(0, 8);
}

/**
 * Candidate codes close to `wanted`, in a fixed order for the given numbers (the caller passes random
 * two-digit numbers and keeps only the ones that are free).
 */
export function candidateCodes(wanted: string, numbers: number[]): string[] {
  const base = normalizeCode(wanted).replace(/[0-9]+$/, "").slice(0, 10) || "FRIEND";
  const out = numbers.map((n) => `${base}${String(Math.abs(n) % 100).padStart(2, "0")}`.slice(0, 12));
  return [...new Set(out)].filter((c) => c !== normalizeCode(wanted) && !codeProblem(c));
}

/** Surprise amount (paise) between min and max, in ₹5 steps. `roll` is a random integer ≥ 0. */
export function giftAmount(minPaise: number, maxPaise: number, roll: number): number {
  const lo = Math.max(500, Math.round(Math.min(minPaise, maxPaise) / 500) * 500);
  const hi = Math.max(lo, Math.round(Math.max(minPaise, maxPaise) / 500) * 500);
  const steps = (hi - lo) / 500 + 1;
  return lo + (Math.abs(Math.floor(roll)) % steps) * 500;
}

/** Bonus gifts earned so far: one for every 3 friends whose order was delivered. */
export function bonusesEarned(deliveredFriends: number): number {
  return Math.floor(Math.max(0, deliveredFriends) / FRIENDS_PER_BONUS);
}

/** Friends still needed for the next bonus (1–3). */
export function friendsToNextBonus(deliveredFriends: number): number {
  return FRIENDS_PER_BONUS - (Math.max(0, deliveredFriends) % FRIENDS_PER_BONUS);
}

/** "Priya S." — enough for the referrer to recognise a friend without exposing their full name. */
export function shortName(name: string): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Friend";
  return parts.length === 1 ? parts[0] : `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}
