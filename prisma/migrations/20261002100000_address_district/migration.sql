-- District for delivery addresses (filled from the pincode lookup). Optional, so existing rows and the previous release are unaffected.
ALTER TABLE "Address" ADD COLUMN "district" TEXT;
