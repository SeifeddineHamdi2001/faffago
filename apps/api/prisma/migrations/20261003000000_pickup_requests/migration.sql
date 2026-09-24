-- Phase 4, step 6: Demander un ramassage (Vendeur 4.5, D-35).

-- ─────────────────────────────────────────────────────────────
-- Time windows: a closed list (D-35)
--
-- Both columns were free text and no request has been written yet; any value
-- that is not a window becomes null.
-- ─────────────────────────────────────────────────────────────

CREATE TYPE "PickupSlot" AS ENUM ('MATIN', 'APRES_MIDI');

ALTER TABLE "pickups" ALTER COLUMN "requestedSlot" TYPE "PickupSlot" USING (
  CASE WHEN "requestedSlot" IN ('MATIN', 'APRES_MIDI') THEN "requestedSlot"::"PickupSlot" END
);
ALTER TABLE "pickups" ALTER COLUMN "plannedSlot" TYPE "PickupSlot" USING (
  CASE WHEN "plannedSlot" IN ('MATIN', 'APRES_MIDI') THEN "plannedSlot"::"PickupSlot" END
);

-- ─────────────────────────────────────────────────────────────
-- Requests
-- ─────────────────────────────────────────────────────────────

-- Drawn by the seller's form: a request sent twice is created once.
ALTER TABLE "pickups" ADD COLUMN "clientRequestId" UUID;
CREATE UNIQUE INDEX "pickups_clientRequestId_key" ON "pickups"("clientRequestId");

-- Who cancelled: the seller (Demandé or Planifié, no fee, D-35, A-13) or the team.
ALTER TABLE "pickups" ADD COLUMN "cancelledByUserId" UUID;
-- Actor column: foreign key here, no Prisma relation (D-3).
ALTER TABLE "pickups" ADD CONSTRAINT "pickups_cancelledByUserId_fkey"
  FOREIGN KEY ("cancelledByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- One open request per pickup address at a time (D-35).
CREATE UNIQUE INDEX "pickups_one_open_per_address"
  ON "pickups"("pickupAddressId") WHERE "status" IN ('DEMANDE', 'PLANIFIE');

ALTER TABLE "pickups" ADD CONSTRAINT "pickups_cancelled_when_annule"
  CHECK (("status" = 'ANNULE') = ("cancelledAt" IS NOT NULL));
ALTER TABLE "pickups" ADD CONSTRAINT "pickups_declared_count_positive"
  CHECK ("declaredCount" IS NULL OR "declaredCount" BETWEEN 1 AND 500);

-- ─────────────────────────────────────────────────────────────
-- Pickup addresses
-- ─────────────────────────────────────────────────────────────

ALTER TABLE "pickup_addresses" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- An address a pickup already used is never rewritten: it is deactivated and
-- a new one takes its place (D-35). This points to that new one.
ALTER TABLE "pickup_addresses" ADD COLUMN "replacedById" UUID;
ALTER TABLE "pickup_addresses" ADD CONSTRAINT "pickup_addresses_replacedById_fkey"
  FOREIGN KEY ("replacedById") REFERENCES "pickup_addresses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "pickup_addresses_replacedById_key" ON "pickup_addresses"("replacedById");

-- One default address per seller, and only an active one.
CREATE UNIQUE INDEX "pickup_addresses_one_default_per_seller"
  ON "pickup_addresses"("sellerId") WHERE "isDefault";
ALTER TABLE "pickup_addresses" ADD CONSTRAINT "pickup_addresses_default_is_active"
  CHECK (NOT "isDefault" OR "isActive");
