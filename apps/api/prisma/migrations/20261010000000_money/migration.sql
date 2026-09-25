-- Phase 8, money (D-79 to D-85).

-- A return taken out and not handed over comes back to the depot (D-81).
ALTER TYPE "ParcelEventType" ADD VALUE 'RETOUR_NON_REMIS';

-- ── Caisse (D-79) ─────────────────────────────────────────────
CREATE TYPE "CaisseLineOrigin" AS ENUM ('JOUR', 'TARDIF');

ALTER TABLE "caisse_sessions"
  ADD COLUMN "countedByUserId" UUID,
  ADD COLUMN "ecartCheckedAt" TIMESTAMP(3),
  ADD COLUMN "ecartCheckedByUserId" UUID;
ALTER TABLE "caisse_sessions" ADD CONSTRAINT "caisse_sessions_countedByUserId_fkey"
  FOREIGN KEY ("countedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "caisse_sessions" ADD CONSTRAINT "caisse_sessions_ecartCheckedByUserId_fkey"
  FOREIGN KEY ("ecartCheckedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Checked means checked by someone, with a note (answer 3).
ALTER TABLE "caisse_sessions" ADD CONSTRAINT "caisse_sessions_ecart_check_complete" CHECK (
  ("ecartCheckedAt" IS NULL) = ("ecartCheckedByUserId" IS NULL)
  AND ("ecartCheckedAt" IS NULL OR "ecartNote" IS NOT NULL)
);
-- A closed session has its count and its écart.
ALTER TABLE "caisse_sessions" ADD CONSTRAINT "caisse_sessions_closed_is_complete" CHECK (
  "status" <> 'CLOTUREE'
  OR ("countedMillimes" IS NOT NULL AND "ecartMillimes" IS NOT NULL AND "closedAt" IS NOT NULL)
);

-- A delivery of the day, or a "scan tardif" synced after its own day was closed.
ALTER TABLE "caisse_session_parcels"
  ADD COLUMN "origin" "CaisseLineOrigin" NOT NULL DEFAULT 'JOUR';

-- ── Bons de versement (D-80) ──────────────────────────────────
-- A cancelled bon keeps its lines, released: the parcel may go on a new bon,
-- and stays on one active bon at most (A-5a).
ALTER TABLE "bon_versement_parcels" ADD COLUMN "releasedAt" TIMESTAMP(3);
DROP INDEX "bon_versement_parcels_parcelId_key";
CREATE UNIQUE INDEX "bon_versement_parcels_active_parcel_key"
  ON "bon_versement_parcels"("parcelId") WHERE "releasedAt" IS NULL;
CREATE INDEX "bon_versement_parcels_parcelId_idx" ON "bon_versement_parcels"("parcelId");

-- A bon with no planned pickup is assigned a ramasseur and a day (answer 4).
ALTER TABLE "bons_versement" ADD COLUMN "plannedDate" DATE;
ALTER TABLE "bons_retour" ADD COLUMN "plannedDate" DATE;

-- ── Livreur pay plan (A-16, D-82) ─────────────────────────────
ALTER TABLE "couriers"
  ADD COLUMN "payPlanSince" DATE NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN "pendingPayPlan" "PayPlan",
  ADD COLUMN "pendingPayPlanFrom" DATE;
-- Existing couriers: their plan runs since their account (Tunis day).
UPDATE "couriers" SET "payPlanSince" = ("createdAt" + INTERVAL '1 hour')::date;
ALTER TABLE "couriers" ADD CONSTRAINT "couriers_pending_plan_complete" CHECK (
  ("pendingPayPlan" IS NULL) = ("pendingPayPlanFrom" IS NULL)
);
