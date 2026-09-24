-- Phase 4, step 2: Créer un colis is safe to retry.
--
-- The seller's form draws one UUID when it opens and sends it with the parcel.
-- A second request with the same UUID (a double click, a retry after a lost
-- answer) finds the parcel already created instead of creating a second one,
-- with a second code and a second label. Null for parcels made any other way.

ALTER TABLE "parcels" ADD COLUMN "clientRequestId" UUID;

CREATE UNIQUE INDEX "parcels_clientRequestId_key" ON "parcels"("clientRequestId");
