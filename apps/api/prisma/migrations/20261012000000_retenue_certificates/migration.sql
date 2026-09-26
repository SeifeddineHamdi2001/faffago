-- Retenue à la source certificates and the seller's CIN number (D-89).

-- Printed on the certificates; admin only; required for CIN uniquement.
ALTER TABLE "sellers" ADD COLUMN "cinNumber" VARCHAR(8);
ALTER TABLE "sellers" ADD CONSTRAINT "sellers_cin_number_format"
  CHECK ("cinNumber" IS NULL OR "cinNumber" ~ '^[0-9]{8}$');

-- A corrected bon's certificate is Annulé and kept; the next Remis issues a
-- new one. One active certificate per bon.
ALTER TABLE "retenue_certificates"
  ADD COLUMN "sellerName" TEXT NOT NULL,
  ADD COLUMN "shopName" TEXT NOT NULL,
  ADD COLUMN "cinNumber" VARCHAR(8) NOT NULL,
  ADD COLUMN "sellerAddress" TEXT NOT NULL,
  ADD COLUMN "cancelledAt" TIMESTAMP(3),
  ADD COLUMN "cancelledByUserId" UUID;
DROP INDEX "retenue_certificates_bonVersementId_key";
CREATE UNIQUE INDEX "retenue_certificates_active_bon_key"
  ON "retenue_certificates"("bonVersementId") WHERE "cancelledAt" IS NULL;
CREATE INDEX "retenue_certificates_bonVersementId_idx" ON "retenue_certificates"("bonVersementId");

ALTER TABLE "retenue_certificates" ADD CONSTRAINT "retenue_certificates_cancelledByUserId_fkey"
  FOREIGN KEY ("cancelledByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "retenue_certificates" ADD CONSTRAINT "retenue_certificates_amounts" CHECK (
  "amountMillimes" > 0 AND "baseMillimes" > 0 AND "rateBps" > 0
  AND ("cancelledAt" IS NULL) = ("cancelledByUserId" IS NULL)
);
