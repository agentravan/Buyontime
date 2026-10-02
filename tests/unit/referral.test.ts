import { test } from "node:test";
import assert from "node:assert/strict";
import { bonusesEarned, candidateCodes, codeBase, codeProblem, friendsToNextBonus, giftAmount, normalizeCode, shortName } from "@/lib/referral";

test("codes are normalised and checked", () => {
  assert.equal(normalizeCode(" priya-10 "), "PRIYA10");
  assert.equal(codeProblem("PRIYA10"), null);
  assert.ok(codeProblem("AB1"));          // too short
  assert.ok(codeProblem("A".repeat(13))); // too long
  assert.ok(codeProblem("123456"));       // needs a letter
  assert.ok(codeProblem("ADMIN"));        // reserved
  assert.ok(codeProblem("SPINAB12"));     // would look like a spin coupon
});

test("default code comes from the first name", () => {
  assert.equal(codeBase("Priya Sharma"), "PRIYA");
  assert.equal(codeBase("al"), "ALFRIEND");
  assert.equal(codeBase(""), "FRIEND");
});

test("suggestions stay close to what was asked for and are valid", () => {
  const s = candidateCodes("PRIYA", [7, 42, 42, 99]);
  assert.deepEqual(s, ["PRIYA07", "PRIYA42", "PRIYA99"]);
  assert.ok(candidateCodes("PRIYA10", [10, 11]).every((c) => c !== "PRIYA10"));
  for (const c of candidateCodes("VERYLONGNAMEHERE", [1, 2, 3])) assert.equal(codeProblem(c), null);
});

test("gift amount stays inside the range in ₹5 steps", () => {
  for (let r = 0; r < 200; r++) {
    const a = giftAmount(2500, 7500, r);
    assert.ok(a >= 2500 && a <= 7500 && a % 500 === 0, String(a));
  }
  assert.equal(giftAmount(5000, 5000, 9), 5000);
  assert.equal(giftAmount(7500, 2500, 0), 2500); // swapped limits still work
});

test("one bonus for every 3 friends whose order was delivered", () => {
  assert.equal(bonusesEarned(0), 0);
  assert.equal(bonusesEarned(2), 0);
  assert.equal(bonusesEarned(3), 1);
  assert.equal(bonusesEarned(8), 2);
  assert.equal(friendsToNextBonus(0), 3);
  assert.equal(friendsToNextBonus(2), 1);
  assert.equal(friendsToNextBonus(3), 3);
});

test("friends are shown by short name", () => {
  assert.equal(shortName("Priya Sharma"), "Priya S.");
  assert.equal(shortName("Ravi"), "Ravi");
  assert.equal(shortName("  "), "Friend");
});
