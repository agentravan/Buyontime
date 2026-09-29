-- Customer sign-in / sign-up design ("teal" or "gold").
ALTER TABLE "StoreSettings" ADD COLUMN "loginLook" TEXT NOT NULL DEFAULT 'teal';
