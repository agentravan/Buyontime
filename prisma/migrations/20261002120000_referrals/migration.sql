-- Refer & earn: each customer has a referral code; a referrer earns a gift coupon when a friend they
-- referred gets their first order delivered, plus a bonus for every 3 such friends.
-- Additive only: new nullable / defaulted columns and one new table.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "referralCode" TEXT,
ADD COLUMN     "referredById" TEXT;

-- AlterTable
ALTER TABLE "StoreSettings" ADD COLUMN     "referralCouponMinOrder" INTEGER NOT NULL DEFAULT 29900,
ADD COLUMN     "referralCouponValidDays" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "referralEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "referralMilestoneBonus" INTEGER NOT NULL DEFAULT 15000,
ADD COLUMN     "referralRewardMax" INTEGER NOT NULL DEFAULT 7500,
ADD COLUMN     "referralRewardMin" INTEGER NOT NULL DEFAULT 2500;

-- CreateTable
CREATE TABLE "ReferralReward" (
    "id" TEXT NOT NULL,
    "referrerId" TEXT NOT NULL,
    "friendId" TEXT,
    "milestone" INTEGER,
    "amount" INTEGER NOT NULL,
    "couponId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferralReward_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReferralReward_couponId_key" ON "ReferralReward"("couponId");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralReward_referrerId_friendId_key" ON "ReferralReward"("referrerId", "friendId");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralReward_referrerId_milestone_key" ON "ReferralReward"("referrerId", "milestone");

-- CreateIndex
CREATE UNIQUE INDEX "User_referralCode_key" ON "User"("referralCode");

-- CreateIndex
CREATE INDEX "User_referredById_idx" ON "User"("referredById");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_referredById_fkey" FOREIGN KEY ("referredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralReward" ADD CONSTRAINT "ReferralReward_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralReward" ADD CONSTRAINT "ReferralReward_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE SET NULL ON UPDATE CASCADE;
