-- A message written offline in the courier app joins the queue like a scan:
-- it is applied once under the id the phone drew (Coursier 4.8, 4.9). The
-- message's own id is that id, so a message is stored once whatever happens.
ALTER TABLE "courier_operations" DROP CONSTRAINT "courier_operations_kind_check";
ALTER TABLE "courier_operations" ADD CONSTRAINT "courier_operations_kind_check"
  CHECK ("kind" IN ('TERMINER_RAMASSAGE', 'NOTE_ADRESSE', 'MESSAGE_CHAT'));

-- The chat's lists read a thread's latest message and a person's unread ones.
CREATE INDEX "chat_messages_threadId_senderKind_createdAt_idx"
  ON "chat_messages" ("threadId", "senderKind", "createdAt");

-- Messages of one upload of the courier's queue share a millisecond: each gets
-- a number from a sequence, in the order it was written, so a thread reads in
-- the order the phone recorded (as parcel_events.sequence, phase 4).
ALTER TABLE "chat_messages" ADD COLUMN "sequence" BIGSERIAL NOT NULL;
CREATE UNIQUE INDEX "chat_messages_sequence_key" ON "chat_messages"("sequence");
