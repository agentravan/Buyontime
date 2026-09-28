-- Owner inbox(es) for new-order alert emails.
ALTER TABLE "StoreSettings" ADD COLUMN "orderAlertEmail" TEXT;
