-- Spin & Win: one spin per customer, personal coupons, free-delivery coupons, creator gift voucher.
-- Additive only: every new column has a default, so the previous release keeps working.

-- CreateEnum
CREATE TYPE "SpinPrize" AS ENUM ('DISCOUNT_10', 'DISCOUNT_20', 'DISCOUNT_30', 'FREE_DELIVERY', 'CREATOR_VOUCHER');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "creatorRewardEligible" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Coupon" ADD COLUMN     "freeShipping" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "source" TEXT,
ADD COLUMN     "userId" TEXT;

-- AlterTable
ALTER TABLE "StoreSettings" ADD COLUMN     "creatorVoucherAmount" INTEGER NOT NULL DEFAULT 10000,
ADD COLUMN     "spinCouponValidDays" INTEGER NOT NULL DEFAULT 7,
ADD COLUMN     "spinEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "spinMaxDiscount" INTEGER NOT NULL DEFAULT 15000,
ADD COLUMN     "spinMinOrder" INTEGER NOT NULL DEFAULT 49900,
ADD COLUMN     "spinWeight10" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN     "spinWeight20" INTEGER NOT NULL DEFAULT 25,
ADD COLUMN     "spinWeight30" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "spinWeightFreeDelivery" INTEGER NOT NULL DEFAULT 10;

-- CreateTable
CREATE TABLE "SpinResult" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "prize" "SpinPrize" NOT NULL,
    "couponId" TEXT,
    "voucherBrand" TEXT,
    "voucherAmount" INTEGER,
    "voucherCode" TEXT,
    "voucherIssuedAt" TIMESTAMP(3),
    "revealedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpinResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SpinResult_userId_key" ON "SpinResult"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SpinResult_couponId_key" ON "SpinResult"("couponId");

-- CreateIndex
CREATE INDEX "SpinResult_prize_createdAt_idx" ON "SpinResult"("prize", "createdAt");

-- CreateIndex
CREATE INDEX "Coupon_userId_idx" ON "Coupon"("userId");

-- AddForeignKey
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpinResult" ADD CONSTRAINT "SpinResult_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpinResult" ADD CONSTRAINT "SpinResult_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE SET NULL ON UPDATE CASCADE;
