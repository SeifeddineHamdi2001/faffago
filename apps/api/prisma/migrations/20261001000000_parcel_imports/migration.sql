-- Phase 4, step 3: Import CSV (Vendeur 4.3, D-37).
--
-- One row per imported file. Its id is drawn by the seller's screen when the
-- file is read, so an import sent twice (a retry after a lost answer) finds
-- the first instead of creating every parcel a second time. Each parcel keeps
-- the file line it came from, for the result screen and the batch of labels.

CREATE TABLE "parcel_imports" (
    "id" UUID NOT NULL,
    "sellerId" UUID NOT NULL,
    "createdByUserId" UUID NOT NULL,
    "fileName" TEXT NOT NULL,
    "parcelCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parcel_imports_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "parcel_imports_parcel_count" CHECK ("parcelCount" BETWEEN 1 AND 500)
);

CREATE INDEX "parcel_imports_sellerId_createdAt_idx" ON "parcel_imports"("sellerId", "createdAt");

ALTER TABLE "parcel_imports" ADD CONSTRAINT "parcel_imports_sellerId_fkey"
  FOREIGN KEY ("sellerId") REFERENCES "sellers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Actor column: foreign key here, no Prisma relation (D-3).
ALTER TABLE "parcel_imports" ADD CONSTRAINT "parcel_imports_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "parcels" ADD COLUMN "importId" UUID;
ALTER TABLE "parcels" ADD COLUMN "importLine" INTEGER;

ALTER TABLE "parcels" ADD CONSTRAINT "parcels_importId_fkey"
  FOREIGN KEY ("importId") REFERENCES "parcel_imports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "parcels_importId_importLine_key" ON "parcels"("importId", "importLine");

-- A parcel from a file knows its line; a parcel from the form has neither.
ALTER TABLE "parcels" ADD CONSTRAINT "parcels_import_line_with_import"
  CHECK (("importId" IS NULL) = ("importLine" IS NULL));
