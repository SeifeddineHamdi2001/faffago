-- Phase 5, step 2: the depot's scan station (Admin 4.2, D-53).

-- What the parcel was just before the scan, so "Annuler le dernier scan"
-- can put it back (D-54): a Sortie coursier clears the relance date, slot and
-- origin, and no event records them. A refused scan keeps it too, to show the
-- parcel as it was when refused. Null when the code matched no parcel.
ALTER TABLE "scans" ADD COLUMN "parcelBefore" JSONB;

-- The courier chosen on the station before scanning: the livreur a Sortie
-- coursier assigns, or the one whose parcels a Retour de tournée takes back.
ALTER TABLE "scans" ADD COLUMN "targetCourierId" UUID;
ALTER TABLE "scans" ADD CONSTRAINT "scans_targetCourierId_fkey"
  FOREIGN KEY ("targetCourierId") REFERENCES "couriers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- An accepted depot scan keeps what the parcel was before it. The courier
-- app's scans (phase 6) decide their own cancellation rule.
ALTER TABLE "scans" ADD CONSTRAINT "scans_depot_scan_keeps_parcel_before"
  CHECK (
    NOT "accepted"
    OR "action" NOT IN ('ENTREE_DEPOT', 'SORTIE_COURSIER', 'RETOUR_DE_TOURNEE')
    OR ("parcelId" IS NOT NULL AND "parcelBefore" IS NOT NULL)
  );
-- A refused scan says why.
ALTER TABLE "scans" ADD CONSTRAINT "scans_refused_has_reason"
  CHECK ("accepted" OR "refusalReason" IS NOT NULL);
