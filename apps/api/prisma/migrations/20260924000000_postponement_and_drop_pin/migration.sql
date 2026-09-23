-- Customer postponement ("Reporté par le client", decision 6) and the removal
-- of the unused courier PIN hash.
--
-- A postponement is planned, not verified: the parcel goes straight to Relancé
-- with the date the customer asked for, never through À vérifier. Telling that
-- apart from the seller's own Relancer needs an origin on the parcel, because
-- the two are shown differently to the seller and on the public page.

-- CreateEnum
CREATE TYPE "RelaunchOrigin" AS ENUM ('VENDEUR', 'CLIENT');

-- CreateEnum
CREATE TYPE "RelaunchSlot" AS ENUM ('MATIN', 'APRES_MIDI', 'SOIR');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'COLIS_REPORTE_PAR_CLIENT';

-- AlterTable: the slot becomes a closed list, and the origin is recorded.
-- The USING clause is safe because no parcel carries a slot yet; the column
-- was added in the first migration and nothing writes it.
ALTER TABLE "parcels"
  ALTER COLUMN "relaunchSlot" TYPE "RelaunchSlot" USING "relaunchSlot"::"RelaunchSlot";

ALTER TABLE "parcels" ADD COLUMN "relaunchOrigin" "RelaunchOrigin";

-- A relance always has a date and an origin together, or neither.
ALTER TABLE "parcels" ADD CONSTRAINT "parcels_relaunch_is_complete" CHECK (
  ("relaunchDate" IS NULL AND "relaunchOrigin" IS NULL)
  OR ("relaunchDate" IS NOT NULL AND "relaunchOrigin" IS NOT NULL)
);

-- Tournées reads this every morning for the zone's livreur.
CREATE INDEX "parcels_relaunchDate_status_idx" ON "parcels" ("relaunchDate", "status");

-- AlterTable: the PIN protects the app when it is reopened and is set by the
-- courier on his own phone, so the server never sees it (Q7). A courier who
-- forgets it logs out and back in with his password.
ALTER TABLE "couriers" DROP COLUMN "pinHash";
