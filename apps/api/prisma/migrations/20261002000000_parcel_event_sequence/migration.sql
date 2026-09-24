-- Phase 4, step 5: the order of a parcel's events.
--
-- One action can write several events in one transaction (a third failure
-- and the automatic return that follows it), all at the same server time.
-- The timeline of Détail du colis (Vendeur 4.8) needs their exact order, so
-- each event gets a number from a sequence, in the order it was written.
--
-- Adding the column fills the existing rows (in no meaningful order among
-- events of one transaction) without firing the append-only triggers: it is
-- a change to the table, not an UPDATE of its rows.

ALTER TABLE "parcel_events" ADD COLUMN "sequence" BIGSERIAL NOT NULL;

CREATE UNIQUE INDEX "parcel_events_sequence_key" ON "parcel_events"("sequence");
