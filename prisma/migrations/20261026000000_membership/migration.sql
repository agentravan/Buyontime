-- BuyOnTime Plus: paid membership with member prices and a gift voucher every few delivered member orders.
-- Additive only: no existing column, row or price is changed.

-- CreateEnum
CREATE TYPE "MembershipPlan" AS ENUM ('HALF_YEAR', 'YEAR');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('PENDING', 'ACTIVE', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MemberRewardStatus" AS ENUM ('PENDING', 'SENT', 'CANCELLED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "memberUntil" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "membershipId" TEXT,
ADD COLUMN     "memberSavings" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "unitRegularPrice" INTEGER;

-- AlterTable
ALTER TABLE "StoreSettings" ADD COLUMN     "membershipEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "membershipPriceHalfYear" INTEGER NOT NULL DEFAULT 20000,
ADD COLUMN     "membershipPriceYear" INTEGER NOT NULL DEFAULT 35000,
ADD COLUMN     "memberProfit" INTEGER NOT NULL DEFAULT 10000,
ADD COLUMN     "regularProfit" INTEGER NOT NULL DEFAULT 18000,
ADD COLUMN     "memberRewardEveryOrders" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "memberRewardMin" INTEGER NOT NULL DEFAULT 5000,
ADD COLUMN     "memberRewardMax" INTEGER NOT NULL DEFAULT 20000;

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "plan" "MembershipPlan" NOT NULL,
    "months" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'PENDING',
    "razorpayOrderId" TEXT NOT NULL,
    "razorpayPaymentId" TEXT,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberReward" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "milestone" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" "MemberRewardStatus" NOT NULL DEFAULT 'PENDING',
    "brand" TEXT,
    "code" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemberReward_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Order_membershipId_status_idx" ON "Order"("membershipId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_razorpayOrderId_key" ON "Membership"("razorpayOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_razorpayPaymentId_key" ON "Membership"("razorpayPaymentId");

-- CreateIndex
CREATE INDEX "Membership_userId_status_idx" ON "Membership"("userId", "status");

-- CreateIndex
CREATE INDEX "Membership_status_endsAt_idx" ON "Membership"("status", "endsAt");

-- CreateIndex
CREATE UNIQUE INDEX "MemberReward_membershipId_milestone_key" ON "MemberReward"("membershipId", "milestone");

-- CreateIndex
CREATE INDEX "MemberReward_status_createdAt_idx" ON "MemberReward"("status", "createdAt");

-- CreateIndex
CREATE INDEX "MemberReward_userId_idx" ON "MemberReward"("userId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberReward" ADD CONSTRAINT "MemberReward_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberReward" ADD CONSTRAINT "MemberReward_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;
