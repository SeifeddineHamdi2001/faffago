-- Phase 4: Demander une modification (D-44).
--
-- One waiting request per parcel. The seller edits the waiting one or
-- withdraws it; a withdrawn request keeps its row, status RETIREE, with who
-- withdrew it (handledByUserId, the seller's own account) and when
-- (handledAt), like a request Faffa Go applied or refused.

ALTER TYPE "ChangeRequestStatus" ADD VALUE 'RETIREE';

-- Set when the seller edits a request that is still waiting.
ALTER TABLE "seller_change_requests" ADD COLUMN "editedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "seller_change_requests_one_waiting_per_parcel"
  ON "seller_change_requests"("parcelId") WHERE "status" = 'EN_ATTENTE';

-- A request is either waiting, or closed by someone at some time.
ALTER TABLE "seller_change_requests" ADD CONSTRAINT "seller_change_requests_closed_when_handled"
  CHECK (("status" = 'EN_ATTENTE') = ("handledAt" IS NULL));
