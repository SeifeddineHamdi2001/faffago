-- Changer de client (Vendeur 4.9, A-17, D-74): the previous customer is kept
-- whole in parcel_client_changes, staff-visible, since the parcel itself now
-- shows only the new one.

ALTER TABLE "parcel_client_changes" ADD COLUMN "previousPhone2" VARCHAR(8);
ALTER TABLE "parcel_client_changes" ADD COLUMN "previousLandmark" TEXT;
ALTER TABLE "parcel_client_changes" ADD COLUMN "previousCourierNote" TEXT;
ALTER TABLE "parcel_client_changes" ADD COLUMN "previousIsExchange" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "parcel_client_changes" ADD COLUMN "previousOpeningAllowed" BOOLEAN NOT NULL DEFAULT false;
