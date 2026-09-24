-- Phase 5, step 7: applying seller change requests (Vendeur 4.6, D-44, D-57).

-- The event written when Faffa Go applies a seller's request: each field,
-- before and after. The seller reads it as "Faffa Go".
ALTER TYPE "ParcelEventType" ADD VALUE 'MODIFICATION_APPLIQUEE';

-- A field printed on the label changed after it was printed: the depot must
-- reprint it (A-9). Set by an applied request, cleared by the team's reprint.
ALTER TABLE "parcels" ADD COLUMN "labelReprintNeeded" BOOLEAN NOT NULL DEFAULT false;

-- Refusing a request needs a reason, and the seller reads it. The staff's
-- internal note (staffNote) stays internal.
ALTER TABLE "seller_change_requests" ADD COLUMN "refusalReason" TEXT;
ALTER TABLE "seller_change_requests" ADD CONSTRAINT "seller_change_requests_refused_has_reason"
  CHECK ("status" <> 'REFUSEE' OR "refusalReason" IS NOT NULL);
