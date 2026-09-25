-- Marquer comme traité on a Saisie manuelle exception (A-22, Admin and
-- Dépôt): who and when, so the entry leaves the Exceptions queue.

ALTER TABLE "scans" ADD COLUMN "treatedAt" TIMESTAMP(3);
ALTER TABLE "scans" ADD COLUMN "treatedByUserId" UUID;
-- Actor column: foreign key here, no Prisma relation (D-3).
ALTER TABLE "scans" ADD CONSTRAINT "scans_treatedByUserId_fkey"
  FOREIGN KEY ("treatedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
