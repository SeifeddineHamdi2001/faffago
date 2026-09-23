-- Phase 3: no parcel status changes without its event (D-21).
--
-- "Every status change goes through the parcel event service, which writes an
-- immutable event" (CLAUDE.md) was a convention. This makes it a guarantee, the
-- way the append-only triggers guarantee that events are never rewritten.
--
-- Each event records the transaction that wrote it. At commit, every parcel
-- that was created, or whose status or location changed, must have an event
-- written in that same transaction that ends in exactly the state the parcel
-- is left in. Otherwise the whole transaction is refused. The check is
-- deferred to the commit because the parcel row and its events are written one
-- after the other, and a new parcel must exist before its CREATION event can
-- point at it.
--
-- The cash status is not covered: it moves with the Caisse and the bons
-- (phase 8), whose events carry no status.

-- AlterTable: existing events get the migration's own transaction id, which
-- no later transaction can have.
ALTER TABLE "parcel_events" ADD COLUMN "txid" BIGINT NOT NULL DEFAULT txid_current();

CREATE OR REPLACE FUNCTION faffago_parcel_state_needs_event() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  current_status "ParcelStatus";
  current_location "ParcelLocation";
BEGIN
  -- Deferred: read the parcel as the transaction leaves it, not as it was when
  -- this row was queued, since it may have moved several times since.
  SELECT "status", "location" INTO current_status, current_location
    FROM "parcels" WHERE "id" = NEW."id";
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "parcel_events" e
     WHERE e."parcelId" = NEW."id"
       AND e."txid" = txid_current()
       AND e."newStatus" = current_status
       AND e."newLocation" = current_location
  ) THEN
    RAISE EXCEPTION
      'Colis % : statut % / % sans événement. Tout changement de statut passe par le service des événements.',
      NEW."code", current_status, current_location
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "parcels_creation_needs_event"
  AFTER INSERT ON "parcels"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION faffago_parcel_state_needs_event();

CREATE CONSTRAINT TRIGGER "parcels_state_change_needs_event"
  AFTER UPDATE OF "status", "location" ON "parcels"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  WHEN (OLD."status" IS DISTINCT FROM NEW."status" OR OLD."location" IS DISTINCT FROM NEW."location")
  EXECUTE FUNCTION faffago_parcel_state_needs_event();
