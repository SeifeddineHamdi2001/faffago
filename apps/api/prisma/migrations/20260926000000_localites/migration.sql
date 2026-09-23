-- Phase 2: localités, the third level under the délégation (D-17).
--
-- A parcel and a pickup address now name their localité. Their délégation is
-- still stored, because zones and Tournées work at délégation level, but it is
-- always the localité's: a two-column key (localité, délégation) makes a
-- disagreement impossible, and refuses to move a localité that has parcels to
-- another délégation.
--
-- The new columns are required with no default. There is no production data
-- yet; on a development database that holds parcels or pickup addresses the
-- migration stops here and the database must be reset (D-17).

-- CreateTable
CREATE TABLE "localites" (
    "id" UUID NOT NULL,
    "delegationId" UUID NOT NULL,
    "nameFr" TEXT NOT NULL,
    "nameAr" TEXT,
    "postalCode" VARCHAR(4),
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isOther" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sourceKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "localites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "localites_sourceKey_key" ON "localites"("sourceKey");

-- CreateIndex
CREATE UNIQUE INDEX "localites_delegationId_nameFr_key" ON "localites"("delegationId", "nameFr");

-- CreateIndex: the target of the two-column keys below.
CREATE UNIQUE INDEX "localites_id_delegationId_key" ON "localites"("id", "delegationId");

-- AddForeignKey
ALTER TABLE "localites" ADD CONSTRAINT "localites_delegationId_fkey" FOREIGN KEY ("delegationId") REFERENCES "delegations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- One "Autre" per délégation, which stays active: it is where a parcel goes
-- when its place is not in the list yet.
CREATE UNIQUE INDEX "localites_one_other_per_delegation" ON "localites"("delegationId") WHERE "isOther";
ALTER TABLE "localites" ADD CONSTRAINT "localites_other_stays_active" CHECK (NOT "isOther" OR "isActive");

ALTER TABLE "localites" ADD CONSTRAINT "localites_name_fr_not_blank" CHECK (btrim("nameFr") <> '');
ALTER TABLE "localites" ADD CONSTRAINT "localites_postal_code_format" CHECK ("postalCode" IS NULL OR "postalCode" ~ '^[0-9]{4}$');
-- Prisma keeps list columns nullable; the check keeps this one a list.
ALTER TABLE "localites" ADD CONSTRAINT "localites_aliases_not_null" CHECK ("aliases" IS NOT NULL);

-- AlterTable
ALTER TABLE "parcels" ADD COLUMN     "localiteId" UUID NOT NULL;

-- AlterTable
ALTER TABLE "pickup_addresses" ADD COLUMN     "localiteId" UUID NOT NULL;

-- AlterTable: the localité of the customer that Changer de client replaced.
ALTER TABLE "parcel_client_changes" ADD COLUMN     "previousLocaliteId" UUID NOT NULL;

-- CreateIndex: the parcels filed under Autre are listed for the admin.
CREATE INDEX "parcels_localiteId_idx" ON "parcels"("localiteId");

-- AddForeignKey
ALTER TABLE "parcels" ADD CONSTRAINT "parcels_localiteId_delegationId_fkey" FOREIGN KEY ("localiteId", "delegationId") REFERENCES "localites"("id", "delegationId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pickup_addresses" ADD CONSTRAINT "pickup_addresses_localiteId_delegationId_fkey" FOREIGN KEY ("localiteId", "delegationId") REFERENCES "localites"("id", "delegationId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- No Prisma relation, like the other history columns (D-3): the key is here.
ALTER TABLE "parcel_client_changes" ADD CONSTRAINT "parcel_client_changes_previousLocalite_fkey" FOREIGN KEY ("previousLocaliteId", "previousDelegationId") REFERENCES "localites"("id", "delegationId") ON DELETE RESTRICT ON UPDATE RESTRICT;
