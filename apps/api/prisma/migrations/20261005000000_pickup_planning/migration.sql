-- Phase 5, step 5: planning pickups (Admin 4.4, D-58).

-- Who planned the pickup last, and when: the team plans and re-plans, and
-- the request itself keeps no other trace of it (D-47: no audit_log entry).
ALTER TABLE "pickups" ADD COLUMN "plannedByUserId" UUID;
ALTER TABLE "pickups" ADD COLUMN "plannedAt" TIMESTAMP(3);
-- Actor column: foreign key here, no Prisma relation (D-3).
ALTER TABLE "pickups" ADD CONSTRAINT "pickups_plannedByUserId_fkey"
  FOREIGN KEY ("plannedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A planned pickup always says the day, the window and the ramasseur: the
-- seller reads them (D-47) and the ramasseur's day is built from them.
ALTER TABLE "pickups" ADD CONSTRAINT "pickups_planned_is_complete"
  CHECK (
    "status" <> 'PLANIFIE'
    OR ("plannedDate" IS NOT NULL AND "plannedSlot" IS NOT NULL AND "ramasseurId" IS NOT NULL)
  );
