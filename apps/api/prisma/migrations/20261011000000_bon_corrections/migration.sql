-- Correcting a bon scanned Remis, or a return scanned Retour reçu, by mistake (D-88).

ALTER TYPE "ParcelEventType" ADD VALUE 'CORRECTION_BON';

CREATE TABLE "bon_corrections" (
    "id" UUID NOT NULL,
    "bonVersementId" UUID,
    "bonRetourId" UUID,
    "parcelId" UUID,
    "itemType" "BonRetourItemType",
    "scanId" UUID,
    "statusBefore" "BonStatus" NOT NULL,
    "statusAfter" "BonStatus" NOT NULL,
    "courierId" UUID,
    "caisseSessionId" UUID,
    "caisseClosed" BOOLEAN NOT NULL,
    "coveredBySurplusMillimes" BIGINT NOT NULL DEFAULT 0,
    "shortfallMillimes" BIGINT NOT NULL DEFAULT 0,
    "reason" TEXT NOT NULL,
    "actorUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bon_corrections_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "bon_corrections_bonVersementId_idx" ON "bon_corrections"("bonVersementId");
CREATE INDEX "bon_corrections_bonRetourId_idx" ON "bon_corrections"("bonRetourId");
CREATE INDEX "bon_corrections_caisseSessionId_idx" ON "bon_corrections"("caisseSessionId");
CREATE INDEX "bon_corrections_shortfallMillimes_createdAt_idx" ON "bon_corrections"("shortfallMillimes", "createdAt");

ALTER TABLE "bon_corrections" ADD CONSTRAINT "bon_corrections_bonVersementId_fkey"
  FOREIGN KEY ("bonVersementId") REFERENCES "bons_versement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bon_corrections" ADD CONSTRAINT "bon_corrections_bonRetourId_fkey"
  FOREIGN KEY ("bonRetourId") REFERENCES "bons_retour"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bon_corrections" ADD CONSTRAINT "bon_corrections_caisseSessionId_fkey"
  FOREIGN KEY ("caisseSessionId") REFERENCES "caisse_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bon_corrections" ADD CONSTRAINT "bon_corrections_parcelId_fkey"
  FOREIGN KEY ("parcelId") REFERENCES "parcels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bon_corrections" ADD CONSTRAINT "bon_corrections_scanId_fkey"
  FOREIGN KEY ("scanId") REFERENCES "scans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bon_corrections" ADD CONSTRAINT "bon_corrections_courierId_fkey"
  FOREIGN KEY ("courierId") REFERENCES "couriers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bon_corrections" ADD CONSTRAINT "bon_corrections_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- One bon, of one kind; a bon de retour names its line; a reason; amounts
-- never negative, and only on a bon de versement whose caisse was closed.
ALTER TABLE "bon_corrections" ADD CONSTRAINT "bon_corrections_shape" CHECK (
  (("bonVersementId" IS NULL) <> ("bonRetourId" IS NULL))
  AND ("bonRetourId" IS NULL OR ("parcelId" IS NOT NULL AND "itemType" IS NOT NULL))
  AND length(btrim("reason")) > 0
  AND "coveredBySurplusMillimes" >= 0
  AND "shortfallMillimes" >= 0
  AND (("coveredBySurplusMillimes" = 0 AND "shortfallMillimes" = 0)
       OR ("bonVersementId" IS NOT NULL AND "caisseClosed"))
);

-- Append-only, as parcel_events and audit_log: a correction is itself never corrected.
CREATE TRIGGER "bon_corrections_append_only"
  BEFORE UPDATE OR DELETE ON "bon_corrections"
  FOR EACH ROW EXECUTE FUNCTION faffago_block_mutation();
CREATE TRIGGER "bon_corrections_no_truncate"
  BEFORE TRUNCATE ON "bon_corrections"
  FOR EACH STATEMENT EXECUTE FUNCTION faffago_block_mutation();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'faffago_app') THEN
    RETURN;
  END IF;
  EXECUTE 'REVOKE UPDATE, DELETE, TRUNCATE ON TABLE bon_corrections FROM faffago_app';
END
$$;
