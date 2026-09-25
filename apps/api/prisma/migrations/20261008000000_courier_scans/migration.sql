-- Phase 6: the courier app's scans (Coursier 4.4, 4.6, 4.9; A-11, A-13, D-61).

-- The charge a scan created: the delivery fee of a Livré, the return fee of a
-- third failure. Cancelling the scan within its minute (A-11) marks exactly
-- these ANNULEE, since the fee is owed only for a delivery that happened (A-1).
ALTER TABLE "seller_charges" ADD COLUMN "scanId" UUID;
ALTER TABLE "seller_charges" ADD CONSTRAINT "seller_charges_scanId_fkey"
  FOREIGN KEY ("scanId") REFERENCES "scans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "seller_charges_scanId_idx" ON "seller_charges"("scanId");

-- An accepted courier scan keeps what the parcel was before it, so it can be
-- cancelled (A-11), as a depot scan does (D-54).
ALTER TABLE "scans" ADD CONSTRAINT "scans_courier_scan_keeps_parcel_before"
  CHECK (
    NOT "accepted"
    OR "action" NOT IN ('RAMASSAGE', 'LIVRE', 'ECHEC')
    OR ("parcelId" IS NOT NULL AND "parcelBefore" IS NOT NULL)
  );

-- A Livré confirms the amount collected (A-24); a pickup scan names its pickup.
ALTER TABLE "scans" ADD CONSTRAINT "scans_delivery_keeps_amount"
  CHECK (NOT "accepted" OR "action" <> 'LIVRE' OR "collectedMillimes" IS NOT NULL);
ALTER TABLE "scans" ADD CONSTRAINT "scans_pickup_scan_names_pickup"
  CHECK (NOT "accepted" OR "action" <> 'RAMASSAGE' OR "pickupId" IS NOT NULL);
ALTER TABLE "scans" ADD CONSTRAINT "scans_pickupId_fkey"
  FOREIGN KEY ("pickupId") REFERENCES "pickups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- One courier operation that is not a scan (Terminer le ramassage, a note
-- d'adresse) is applied once: the phone's id, replayed, answers the same.
CREATE TABLE "courier_operations" (
    "id" UUID NOT NULL,
    "actorUserId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "deviceTime" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ok" BOOLEAN NOT NULL,
    "code" TEXT,
    "message" TEXT NOT NULL,

    CONSTRAINT "courier_operations_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "courier_operations" ADD CONSTRAINT "courier_operations_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "courier_operations" ADD CONSTRAINT "courier_operations_kind_check"
  CHECK ("kind" IN ('TERMINER_RAMASSAGE', 'NOTE_ADRESSE'));
